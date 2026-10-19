// TV mode transport (ticket 0175): a WebSocket into the PadRoom (src/worker/pad.js) for
// pairing and signalling, plus a WebRTC DataChannel per phone for the input itself
// (unordered, no retransmits: a late input frame is worse than a lost one). No STUN/TURN —
// only our own origin is ever contacted (AGENTS.md §3.3) — so P2P connects when phone and
// TV share a network; otherwise everything rides the relay. Both ends use the same frames.

const API = `${import.meta.env.BASE_URL}api`;
const RTC_TIMEOUT_MS = 6000;
const DC = { ordered: false, maxRetransmits: 0 };

export function wsUrl(code, query, loc = location) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${API}/pad/${code}?${query}`;
}

/** POST /api/pad → { code, key, ttlMs } (throws when TV mode is unavailable). `key` is the TV's secret. */
export async function newPadCode(fetchFn = fetch) {
  const res = await fetchFn(`${API}/pad`, { method: 'POST' });
  if (!res.ok) throw new Error(`pad ${res.status}`);
  return res.json();
}

/** Candidates can arrive before the remote description is set: hold them until it is. */
function iceSink(pc) {
  const held = [];
  return {
    add(c) { if (pc.remoteDescription) pc.addIceCandidate(c).catch(() => {}); else held.push(c); },
    flush() { while (held.length) pc.addIceCandidate(held.shift()).catch(() => {}); },
  };
}

const hasRtc = () => typeof RTCPeerConnection === 'function';
const FATAL = new Set(['NO_CODE', 'NO_TV', 'EXPIRED', 'FULL', 'BAD_ROLE', 'BAD_KEY']);

function openSocket(url, { onMsg, onOpen, onClose }) {
  const ws = new WebSocket(url);
  ws.onopen = () => onOpen && onOpen(ws);
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = (e) => onClose && onClose(e);
  ws.onerror = () => {};
  return ws;
}

/**
 * The TV end: many pads. Callbacks: onPad(slot, joined), onFrame(slot, data, via),
 * onState('open' | 'down' | 'error', code).
 */
export function createTvLink({ code, key, onPad, onFrame, onState = () => {}, rtc = hasRtc() }) {
  const peers = new Map(); // slot → { pc, dc }
  let ws = null, closed = false, retry = 0;

  const relay = (to, d) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to, d })); };
  function drop(slot) {
    const p = peers.get(slot);
    if (p) { try { p.dc && p.dc.close(); p.pc.close(); } catch { /* closed */ } }
    peers.delete(slot);
  }
  async function answer(slot, sdp) {
    if (!rtc) return;
    drop(slot);
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer = { pc, dc: null, ice: iceSink(pc) };
    peers.set(slot, peer);
    pc.onicecandidate = (e) => { if (e.candidate) relay(slot, { k: 'ice', c: e.candidate.toJSON() }); };
    pc.ondatachannel = (e) => {
      peer.dc = e.channel;
      peer.dc.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; } onFrame(slot, d, 'p2p'); };
    };
    try {
      await pc.setRemoteDescription(sdp);
      peer.ice.flush();
      await pc.setLocalDescription(await pc.createAnswer());
      relay(slot, { k: 'sdp', sdp: pc.localDescription.toJSON() });
    } catch { drop(slot); }
  }
  function onMsg(m) {
    if (m.t === 'join') onPad(m.s, true);
    else if (m.t === 'leave') { drop(m.s); onPad(m.s, false); }
    else if (m.t === 'err') { closed = FATAL.has(m.code) || closed; onState('error', m.code); }
    else if (m.t === 'm') {
      const d = m.d;
      if (d && d.k === 'sdp' && d.sdp && d.sdp.type === 'offer') answer(m.s, d.sdp);
      else if (d && d.k === 'ice') { const p = peers.get(m.s); if (p) p.ice.add(d.c); }
      else onFrame(m.s, d, 'relay');
    }
  }
  function connect() {
    ws = openSocket(wsUrl(code, `role=tv&key=${encodeURIComponent(key || '')}`), {
      onMsg,
      onOpen: () => { retry = 0; onState('open'); },
      onClose: () => {
        if (closed) return;
        onState('down');
        setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      },
    });
  }
  connect();
  return {
    path: (slot) => { const p = peers.get(slot); return p && p.dc && p.dc.readyState === 'open' ? 'p2p' : 'relay'; },
    send(slot, data) {
      const p = peers.get(slot);
      if (p && p.dc && p.dc.readyState === 'open') { try { p.dc.send(JSON.stringify(data)); return 'p2p'; } catch { /* fall through */ } }
      relay(slot, data);
      return 'relay';
    },
    close() { closed = true; for (const s of [...peers.keys()]) drop(s); try { ws.close(); } catch { /* closed */ } },
  };
}

/**
 * The phone end. Callbacks: onFrame(data, via), onState(state, detail) with state one of
 * 'connecting' | 'paired' (detail = slot) | 'p2p' | 'tv-gone' | 'down' | 'error' (detail = code).
 */
export function createPadLink({ code, onFrame, onState = () => {}, rtc = hasRtc(), store = globalThis.sessionStorage }) {
  const slotKey = `ot-pad-slot-${code}`;
  let slot = -1;
  try { slot = Number(store.getItem(slotKey) ?? -1); } catch { /* private mode */ }
  let ws = null, pc = null, dc = null, ice = null, closed = false, retry = 0, rtcTimer = 0;

  const relay = (d) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(d)); };
  function stopRtc() {
    clearTimeout(rtcTimer);
    try { dc && dc.close(); pc && pc.close(); } catch { /* closed */ }
    pc = null; dc = null; ice = null;
  }
  async function startRtc() {
    stopRtc();
    if (!rtc) return;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      ice = iceSink(pc);
      dc = pc.createDataChannel('in', DC);
      const mine = pc;
      dc.onopen = () => { clearTimeout(rtcTimer); onState('p2p'); };
      dc.onclose = () => { if (pc === mine) { dc = null; onState('paired', slot); } };
      dc.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; } onFrame(d, 'p2p'); };
      pc.onicecandidate = (e) => { if (e.candidate) relay({ k: 'ice', c: e.candidate.toJSON() }); };
      await pc.setLocalDescription(await pc.createOffer());
      relay({ k: 'sdp', sdp: pc.localDescription.toJSON() });
      rtcTimer = setTimeout(() => { if (!dc || dc.readyState !== 'open') stopRtc(); }, RTC_TIMEOUT_MS);
    } catch { stopRtc(); }
  }
  function onMsg(m) {
    if (m.t === 'hi') {
      slot = m.s;
      try { store.setItem(slotKey, String(slot)); } catch { /* private mode */ }
      onState('paired', slot);
      startRtc();
    } else if (m.t === 'tv-back') { onState('paired', slot); startRtc(); }
    else if (m.t === 'tv-gone') { stopRtc(); onState('tv-gone'); }
    else if (m.t === 'err') { closed = FATAL.has(m.code) || closed; onState('error', m.code); }
    else if (m.t === 'm') {
      const d = m.d;
      if (d && d.k === 'sdp' && pc && d.sdp && d.sdp.type === 'answer') { const sink = ice; pc.setRemoteDescription(d.sdp).then(() => sink && sink.flush(), stopRtc); }
      else if (d && d.k === 'ice') { if (ice) ice.add(d.c); }
      else onFrame(d, 'relay');
    }
  }
  function connect() {
    onState('connecting');
    ws = openSocket(wsUrl(code, `role=pad${slot >= 0 ? `&slot=${slot}` : ''}`), {
      onMsg,
      onOpen: () => { retry = 0; },
      onClose: () => {
        stopRtc();
        if (closed) return;
        onState('down');
        setTimeout(connect, Math.min(6000, 400 * 2 ** retry++));
      },
    });
  }
  connect();
  return {
    get path() { return dc && dc.readyState === 'open' ? 'p2p' : 'relay'; },
    get slot() { return slot; },
    send(data) {
      if (dc && dc.readyState === 'open') { try { dc.send(JSON.stringify(data)); return 'p2p'; } catch { /* fall through */ } }
      relay(data);
      return 'relay';
    },
    close() { closed = true; stopRtc(); try { ws.close(); } catch { /* closed */ } },
  };
}
