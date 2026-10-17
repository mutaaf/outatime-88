// Room socket (sprint 3): one WebSocket to /outatime/api/room/<CODE> on our own origin.
// Reconnects by itself (backoff, and immediately when the tab comes back), re-sends hello with
// the seat id+key so the server slides you back into the same seat, and keeps a clock offset
// so every screen agrees on when the light goes green.

import { createClockSync } from './ghosts.js';
import { loadSeat, saveSeat } from './identity.js';

const FATAL = new Set([4004, 4008, 4009]); // no such room · flooding · room full

export function roomUrl(code, loc = location) {
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${import.meta.env.BASE_URL}api/room/${code}`;
}

/**
 * opts: { code, profile: () => ({ name, car }), onMessage(msg), onStatus(status, detail) }
 * status: 'connecting' | 'open' | 'reconnecting' | 'closed'
 */
export function createRoomSocket({ code, profile, onMessage, onStatus, WS = WebSocket, url = roomUrl(code) }) {
  const clock = createClockSync();
  let ws = null;
  let closedByUs = false;
  let retry = 0;
  let retryTimer = 0;
  let pingTimer = 0;
  let pings = 0;

  function connect() {
    clearTimeout(retryTimer);
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    onStatus(retry ? 'reconnecting' : 'connecting');
    const sock = new WS(url);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      const seat = loadSeat(code) || {};
      send({ t: 'hello', id: seat.id, key: seat.key, ...profile() });
      pings = 0;
      ping();
      onStatus('open');
    };
    sock.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { clock.add(m.c, m.s, Date.now()); return; }
      if (m.t === 'welcome') saveSeat(code, { id: m.id, key: m.key });
      onMessage(m);
    };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      clearTimeout(pingTimer);
      if (closedByUs || FATAL.has(ev.code)) { onStatus('closed', ev.code); return; }
      retry += 1;
      onStatus('reconnecting');
      retryTimer = setTimeout(connect, Math.min(5000, 300 * 2 ** Math.min(4, retry - 1)));
    };
  }

  // A burst of pings to learn the clock fast, then a slow heartbeat.
  function ping() {
    clearTimeout(pingTimer);
    send({ t: 'ping', c: Date.now() });
    pings += 1;
    pingTimer = setTimeout(ping, pings < 6 ? 250 : 4000);
  }

  function send(obj) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible' && !closedByUs && (!ws || ws.readyState > 1)) { retry = Math.max(retry, 1); connect(); }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  connect();
  return {
    send,
    get open() { return !!ws && ws.readyState === 1; },
    /** Server clock now (ms). */
    now: () => Date.now() + clock.offset,
    get synced() { return clock.count > 0; },
    get rtt() { return clock.rtt; },
    close() {
      closedByUs = true;
      clearTimeout(retryTimer);
      clearTimeout(pingTimer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      try { ws && ws.close(1000, 'bye'); } catch { /* already closed */ }
    },
  };
}
