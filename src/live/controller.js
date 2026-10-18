// Live races with friends (sprint 3): menu → room lobby → synced countdown → race → results
// → rematch. Owns its own overlay DOM (built here, styled by live.css) and talks to main.js
// only through `hooks`, so the solo game stays untouched when you never open a room.
//
// Design goal: one tap to share, one tap to join. A ?room=CODE link drops you straight into
// the lobby with suggested initials; READY is the only required tap.
//
// Friends 10x: car portraits in the lobby and on the podium, kid-safe quick chat (emotes ride
// the relayed state frames, src/live/emotes.js), a live standings tower in the race, a
// spectator board for late joiners, gaps and a series score on the results, and RACE AGAIN
// with your last crew from the friends menu (src/live/crew.js).

import './live.css';
import { GameState } from '../state.js';
import { SaveStore } from '../save.js';
import { ROAD_CFG, POP_CULTURE_ROSTER, WORLD_LEVELS, PACE_MODES } from '../data.js';
import { LIVE, LENGTHS, cleanCode, cpuProfile, cpuZ, cpuX, cpuFinishMs } from '../worker/live-rules.js';
import { cleanInitials } from '../worker/initials.js';
import { createRoomSocket } from './net.js';
import { createGhostTrack } from './ghosts.js';
import { qrToCanvas } from '../qr.js';
import { shareInvite, roomLink } from './share.js';
import { racerInitials, saveRacerInitials, rememberRivals } from './identity.js';
import { EMOTES, EMOTE_SHOW_MS, createEmoteSender, createEmoteReader } from './emotes.js';
import { loadCrew, saveCrew, crewLabel } from './crew.js';
import { thumbHtml, paintThumbs } from './thumbs.js';

export const UNITS_PER_MPH = (11000 * PACE_MODES[LIVE.pace].mult) / 88;
const API = `${import.meta.env.BASE_URL}api`;
const FUN_INITIALS = ['ACE', 'ZAP', 'JET', 'REX', 'SKY', 'MAX', 'NEO', 'ZIG', 'BOP', 'RAD', 'FOX', 'DYN', 'GIG', 'VRM'];
const PLACE = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];
const MEDAL = ['🥇', '🥈', '🥉'];

/** Saved initials if you have them, otherwise a fun suggestion (editable in the lobby). */
export function suggestInitials(saved, rand = Math.random) {
  const ok = cleanInitials(saved);
  if (ok) return ok;
  return FUN_INITIALS[Math.floor(rand() * FUN_INITIALS.length) % FUN_INITIALS.length];
}

export const fmtTime = (ms) => {
  if (ms == null) return 'DNF';
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

// Also publishes the room's invite link, so the results share card invites to the rematch.
export function setRoomParam(c) {
  GameState.liveInvite = c ? roomLink(c) : null;
  try {
    const q = new URLSearchParams(location.search);
    if (c) q.set('room', c); else q.delete('room');
    const qs = q.toString().replace(/=(&|$)/g, '$1'); // keep bare flags like ?debug bare
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
  } catch { /* sandboxed iframe */ }
}

const carOf = (i) => POP_CULTURE_ROSTER[i] || POP_CULTURE_ROSTER[0];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** "LVL 1: CLOCK HOLLOW 2026 3D" → "CLOCK HOLLOW 2026 3D" */
const trackName = (l) => (l ? l.name.replace(/^LVL \d+:\s*/, '') : 'LIVE RACE');

/** Gap label between two progress values, in seconds at the chaser's pace (progress = mph·s). */
export function gapText(dz, mph) {
  const s = Math.abs(dz) / Math.max(30, mph || 0);
  return `${dz >= 0 ? '+' : '-'}${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
}

/** Wins per human across the room's races, best first: [{ name, wins, you }]. */
export function seriesScore(players, me) {
  return players.filter((p) => p.wins > 0).map((p) => ({ name: p.name, wins: p.wins, you: p.id === me }))
    .sort((a, b) => b.wins - a.wins || (a.name < b.name ? -1 : 1));
}

export function createLive(hooks) {
  let sock = null;
  let room = null;
  let me = null;
  let code = null;
  let view = 'off';            // off | menu | lobby | grid | race | done | results | msg
  let raceNo = 0;
  let startAt = 0;
  let dist = 0;                // race length in progress units
  let mySlot = 0;
  let finished = false;
  let lastSend = 0;
  let lastCount = -1;
  let calloutAt = 0;
  let prevPlace = 0;
  let doneSeen = new Set();
  const tracks = new Map();    // slot → ghost track (humans)
  const ghosts = [];           // render objects for renderScene (humans + CPUs)
  const sample = { z: 0, x: 0, y: 0, mph: 0, f: 0 };
  const emoteOut = createEmoteSender();
  const emoteIn = createEmoteReader();
  const rowEmotes = new Map();  // player id → { id, until } (lobby / results bubbles)
  const specZ = new Map();      // slot → latest progress (spectator board)
  let rejoining = false;        // RACE AGAIN: an old room that turns out closed is replaced
  let lastTower = 0;
  let trayOpen = false;
  let qrBig = false;
  let name = suggestInitials(racerInitials() || SaveStore.data.liveName || SaveStore.data.initials);

  const ui = buildDom();

  // ---------- network ----------

  function connect(c) {
    if (sock) sock.close();
    code = c;
    room = null; me = null; raceNo = 0; finished = false;
    rowEmotes.clear(); specZ.clear(); emoteIn.reset(); qrBig = false;
    setRoomParam(c); // a refresh (or a dropped tab) comes straight back to this room
    show('lobby');
    renderLobby();
    sock = createRoomSocket({
      code: c,
      profile: () => ({ name, car: GameState.selectedCharIdx | 0 }),
      onMessage,
      onStatus: (s, detail) => {
        ui.root.dataset.net = s;
        if (s === 'closed' && detail === 4004 && rejoining) { rejoining = false; sock = null; createRoom(true); return; }
        if (s === 'closed' && detail === 4004) message('ROOM NOT FOUND', `Room ${c} has closed. Start a new one?`);
        else if (s === 'closed' && detail === 4009) message('ROOM IS FULL', 'Six racers is the max. Start your own room?');
        renderStatus();
      },
    });
  }

  function onMessage(m) {
    if (m.t === 'welcome') { me = m.id; rejoining = false; return; }
    if (m.t === 'err') return;
    if (m.t === 'p') {
      const tr = tracks.get(m.s);
      if (tr) tr.push(performance.now(), m.d);
      specZ.set(m.s, m.d[0]);
      const em = emoteIn.read(m.s, m.d[4]);
      if (em) { const p = room && room.players.find((q) => q.slot === m.s && q.racer); if (p) showEmote(p, em); }
      if (view === 'lobby' && room && room.state === 'RACING') renderSpectate();
      return;
    }
    if (m.t === 'emo') {
      const p = room && room.players.find((q) => q.id === m.id);
      if (p && p.id !== me && EMOTES[m.e]) showEmote(p, m.e);
      return;
    }
    if (m.t !== 'room') return;
    const prev = room;
    room = m;
    saveCrew(room, me);
    const mine = room.players.find((p) => p.id === me);
    // Someone else crossed the line: call it out.
    for (const p of room.players) {
      if (p.done && !doneSeen.has(p.id) && p.id !== me && room.race === raceNo) {
        doneSeen.add(p.id);
        callout(`🏁 ${p.name} FINISHED!`, '', 1400);
      }
    }
    if (room.state === 'COUNTDOWN' && room.race !== raceNo && mine && mine.racer) beginGrid();
    else if (room.state === 'RESULTS' && raceNo && room.race === raceNo && view !== 'results' && view !== 'lobby') showResults();
    else if (view === 'lobby' || view === 'results') { if (view === 'results' && room.state === 'COUNTDOWN') return; render(); }
    else if (view === 'done') renderWaiting();
    if (prev && prev.host !== room.host && room.host === me && view === 'lobby') callout('👑 YOU ARE THE HOST', '', 1200);
  }

  let lastPostStatus = 0;
  async function post(path) {
    lastPostStatus = 0;
    try {
      const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      lastPostStatus = res.status;
      const body = await res.json().catch(() => ({}));
      return res.ok ? cleanCode(body.code) : null;
    } catch { return null; }
  }

  /** Why a room couldn't be opened, in words a kid can act on. */
  function whyNot(fallback) {
    if (lastPostStatus === 429) return 'Lots of rooms opened in the last minute — wait a few seconds and try again.';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You look offline. Reconnect to Wi-Fi and try again.';
    return fallback;
  }

  async function createRoom(replacing = false) {
    hooks.unlockAudio();
    busy(true);
    const c = await post('/room');
    busy(false);
    if (!c) { message(lastPostStatus === 429 ? 'HOLD ON' : 'OFFLINE', whyNot('Could not open a room. Check your connection and try again.')); return; }
    connect(c);
    if (replacing) callout('🔁 FRESH ROOM READY', 'The old room closed — tap 📨 INVITE to bring the crew', 2200);
  }

  /** RACE AGAIN: back into your last room, or a fresh one if it has closed. */
  function raceAgain() {
    const crew = loadCrew();
    hooks.unlockAudio();
    if (!crew) { createRoom(); return; }
    rejoining = true;
    connect(crew.code);
  }

  async function quickRace() {
    hooks.unlockAudio();
    busy(true);
    const c = await post('/quick');
    busy(false);
    if (c) connect(c); else message(lastPostStatus === 429 ? 'HOLD ON' : 'OFFLINE', whyNot('Quick race is unavailable right now. Try again in a moment.'));
  }

  function leave() {
    if (sock) sock.close();
    sock = null; room = null; me = null; code = null; raceNo = 0;
    ghosts.length = 0; tracks.clear(); rowEmotes.clear();
    setRoomParam(null);
    show('off');
    hooks.leaveLive();
  }

  // ---------- race ----------
  // Positions are race progress (GameState.distance, mph × s), the solo race's unit, so the
  // shared HUD shows laps, gaps and standings for the room. Friends are drawn relative to you:
  // worldZ = your Z + (their progress − yours) × world units per progress.

  function beginGrid() {
    raceNo = room.race;
    startAt = room.startAt;
    dist = LENGTHS[room.cfg.len].dist;
    finished = false;
    prevPlace = 0;
    lastCount = -1;
    doneSeen = new Set();
    tracks.clear();
    ghosts.length = 0;
    const mine = room.players.find((p) => p.id === me);
    mySlot = mine ? mine.slot : 0;
    for (const p of room.players) {
      if (!p.racer || p.id === me) continue;
      tracks.set(p.slot, createGhostTrack(1));
      ghosts.push(ghostFor(p.slot, p.name, p.car, false));
    }
    for (const c of room.cpus) {
      const g = ghostFor(c.slot, c.name, c.car, true);
      g.prof = cpuProfile(room.seed, c.k);
      g.finishAt = cpuFinishMs(g.prof, dist) / 1000;
      ghosts.push(g);
    }
    hooks.startRace({ level: room.cfg.level, seed: room.seed, length: dist });
    GameState.status = 'GRID';
    show('grid');
    const field = [...room.players.filter((p) => p.racer).map((p) => ({ slot: p.slot, name: p.name, car: p.car, you: p.id === me })),
      ...room.cpus.map((c) => ({ slot: c.slot, name: c.name, car: c.car, cpu: true }))].sort((a, b) => a.slot - b.slot);
    ui.gridList.innerHTML = field.map((r, i) =>
      `<li style="animation-delay:${i * 0.32}s;--g:${esc(carOf(r.car).glow)}" class="${r.you ? 'you' : ''} ${r.cpu ? 'cpu' : ''}"><b>${i + 1}</b>${thumbHtml(r.car, 'live-thumb live-thumb-s')}${esc(r.name)}${r.cpu ? '<small>CPU</small>' : ''}${r.you ? '<small>YOU</small>' : ''}</li>`).join('');
    paintThumbs(ui.gridList);
    ui.gridTitle.textContent = `${trackName(WORLD_LEVELS[room.cfg.level])} · ${LENGTHS[room.cfg.len].label}`;
    trayOpen = false;
    renderTray();
  }

  function ghostFor(slot, gName, car, cpu) {
    const c = carOf(car);
    return {
      // Standings entry for the shared race HUD (src/hud.js) …
      id: `live${slot}`, short: gName, color: c.glow, progress: 0, finishTime: null, isPlayer: false,
      // … and a car for both renderers.
      slot, cpu, live: true, ghostTag: gName, name: gName,
      worldZ: 0, offset: 0, x: 0, y: 0, suspY: 0, mph: 0,
      style: c.shape === 'MUSCLE' ? 'MUSCLE' : 'TUNER_WING', shape: c.shape,
      bodyColor: c.body, accentColor: c.cabin, underglow: c.glow,
      takenDown: false, oncoming: false, nosActive: false,
      emote: 0, emoteUntil: 0,
    };
  }

  /** Every animation frame (any game state): countdown, ghosts, outgoing state. */
  function frame() {
    if (!sock || !room || !raceNo) return;
    const sNow = sock.now();
    if (view === 'grid') {
      const left = startAt - sNow;
      const n = Math.ceil(left / 1000);
      if (n !== lastCount && n <= 3 && n >= 1) { lastCount = n; ui.count.textContent = String(n); ui.count.classList.remove('pop'); void ui.count.offsetWidth; ui.count.classList.add('pop'); hooks.beep(n); }
      if (left <= 0) go();
    }
    if (view !== 'grid' && view !== 'race' && view !== 'done' && !(view === 'results' && GameState.mode === 'LIVE')) return;
    const t = Math.max(0, (sNow - startAt) / 1000);
    const pNow = performance.now();
    const me0 = GameState.distance;
    const myZ = GameState.trackPos + ROAD_CFG.playerZOffset;
    // On the grid the field is staggered two-wide; the stagger melts away in the first seconds.
    const fade = Math.max(0, 1 - t / 4);
    // The HUD clock counts down to the room's deadline: the length's cap, or 30 s after the
    // first finisher crosses the line (every screen sees the same number).
    if (room.endAt) GameState.timeLeft = Math.max(0, (room.endAt - sNow) / 1000);
    for (const g of ghosts) {
      if (g.cpu) {
        g.progress = cpuZ(g.prof, t);
        g.x = cpuX(g.prof, t);
        g.mph = g.prof.v;
        if (g.finishTime == null && t >= g.finishAt) g.finishTime = g.finishAt;
      } else {
        const tr = tracks.get(g.slot);
        if (tr && tr.sample(pNow, sample)) { g.progress = sample.z; g.x = sample.x; g.y = sample.y; g.mph = sample.mph; }
        const p = room.players.find((q) => q.slot === g.slot && q.racer);
        if (p && p.done && g.progress < dist) g.progress = dist;
        if (g.finishTime == null && g.progress >= dist) g.finishTime = Math.max(0, GameState.raceTime || t);
      }
      // A friend's emote floats in their name tag (both renderers draw ghostTag) for a moment.
      g.ghostTag = g.emote && pNow < g.emoteUntil ? `${g.name} ${EMOTES[g.emote].e}` : g.name;
      const rowGap = (Math.floor(mySlot / 2) - Math.floor(g.slot / 2)) * 650;
      g.worldZ = myZ + (g.progress - me0) * UNITS_PER_MPH + rowGap * fade;
      g.offset = g.x * (1 - fade) + (g.slot % 2 ? 0.36 : -0.36) * fade;
    }
    if ((view === 'race' || view === 'grid') && pNow - lastSend >= 1000 / LIVE.sendHz) {
      lastSend = pNow;
      const flags = emoteOut.flags((GameState.warpActiveTimer > 0 ? 1 : 0) | (GameState.isDrifting ? 2 : 0), pNow);
      sock.send({ t: 's', d: [Math.round(GameState.distance), Math.round(GameState.playerX * 1000), Math.round(GameState.playerY), Math.round(GameState.speed), flags] });
    }
    if ((view === 'race' || view === 'done') && pNow - lastTower >= 200) {
      lastTower = pNow;
      renderTower();
      if (view === 'done') renderWaiting();
    }
  }

  function go() {
    show('race');
    ui.count.textContent = 'GO!';
    ui.gridList.innerHTML = '';
    ui.gridTitle.textContent = '';
    GameState.status = 'PLAYING';
    hooks.beep(0);
    callout('🚦 GO GO GO!', `FIRST TO THE FLAG · ${LENGTHS[room.cfg.len].label}`, 1300);
    setTimeout(() => { if (view === 'race') ui.count.textContent = ''; }, 700);
  }

  /** From updateGame while racing (after the shared standings ran): overtake callouts. */
  function update() {
    if (view !== 'race' || !raceNo) return;
    const place = GameState.racePosition;
    const now = performance.now();
    if (prevPlace && place < prevPlace && now - calloutAt > 2200) {
      const mine = GameState.distance;
      let passed = null;
      for (const g of ghosts) if (g.progress < mine && (!passed || g.progress > passed.progress)) passed = g;
      if (passed) callout(`⚡ PASSED ${passed.name}!`, `UP TO ${PLACE[place - 1] || place}`, 1100);
    }
    prevPlace = place;
  }

  /** The shared race flow saw you cross the line. */
  function finished_() {
    if (finished || !raceNo) return;
    finished = true;
    const place = GameState.racePosition;
    const ms = Math.round(sock.now() - startAt);
    sock.send({ t: 'fin', ms, race: raceNo });
    GameState.status = 'LIVE_DONE';
    hooks.beep(-1);
    callout(place === 1 ? '🏆 YOU WIN!' : `🏁 YOU FINISHED ${PLACE[place - 1] || place}!`, fmtTime(ms), 2200);
    show('done');
    renderWaiting();
  }

  function wrecked() {
    GameState.hp = Math.round(GameState.maxHp * 0.6);
    GameState.speed = 20;
    GameState.invulnTimer = 2.2;
    callout('💥 WRECKED!', 'BACK ON TRACK — GO GO GO!', 1300);
  }

  function callout(main, sub, ms) {
    calloutAt = performance.now();
    hooks.announce(main, sub, ms);
  }

  // ---------- quick chat ----------

  /** Send emote `e` (1–7): in the race it rides our frames; elsewhere a room message. */
  function emote(e) {
    const now = performance.now();
    if (!sock || !emoteOut.send(e, now)) return false;
    const racing = (view === 'grid' || view === 'race') && raceNo && !finished;
    if (!racing) sock.send({ t: 'emo', e });
    const mine = room && room.players.find((p) => p.id === me);
    if (mine) showEmote(mine, e);
    if (trayOpen) { trayOpen = false; renderTray(); }
    return true;
  }

  function showEmote(p, e) {
    const now = performance.now();
    rowEmotes.set(p.id, { id: e, until: now + EMOTE_SHOW_MS });
    const g = ghosts.find((q) => !q.cpu && q.slot === p.slot);
    if (g) { g.emote = e; g.emoteUntil = now + EMOTE_SHOW_MS; }
    toast(`${p.id === me ? 'YOU' : p.name} ${EMOTES[e].e}`, EMOTES[e].label, p.id === me);
    if (view === 'lobby' || view === 'results') {
      render();
      setTimeout(() => { if (view === 'lobby' || view === 'results') render(); }, EMOTE_SHOW_MS + 30);
    }
  }

  function bubble(id) {
    const b = rowEmotes.get(id);
    return b && performance.now() < b.until ? `<i class="live-bubble" aria-label="${esc(EMOTES[b.id].label)}">${EMOTES[b.id].e}</i>` : '';
  }

  function toast(main, sub, you) {
    const li = document.createElement('li');
    li.className = you ? 'you' : '';
    li.innerHTML = `<b>${esc(main)}</b><small>${esc(sub)}</small>`;
    ui.toasts.prepend(li);
    while (ui.toasts.children.length > 3) ui.toasts.lastChild.remove();
    setTimeout(() => li.remove(), EMOTE_SHOW_MS);
  }

  function emoteButtons(cls) {
    return EMOTES.map((x, i) => (x
      ? `<button type="button" class="${cls}" data-act="emo" data-e="${i}" aria-label="${esc(x.label)}" title="${esc(x.label)}${cls === 'live-emo-key' ? ` (${i})` : ''}">${x.e}</button>` : '')).join('');
  }

  function renderTray() {
    const racing = view === 'grid' || view === 'race' || view === 'done';
    ui.chat.hidden = !racing;
    ui.tray.hidden = !racing || !trayOpen;
    ui.chatBtn.setAttribute('aria-expanded', String(trayOpen));
  }

  // ---------- in-race boards ----------

  function standings() {
    const rows = [];
    if (room) {
      const mine = room.players.find((p) => p.id === me);
      if (mine && mine.racer) rows.push({ name: mine.name, z: finished ? dist : GameState.distance, you: true, done: finished, car: mine.car, mph: GameState.speed });
    }
    for (const g of ghosts) {
      const p = !g.cpu && room ? room.players.find((q) => q.slot === g.slot && q.racer) : null;
      rows.push({ name: g.name, z: Math.min(dist, g.progress), cpu: g.cpu, done: g.finishTime != null, car: p ? p.car : null, mph: g.mph, color: g.color });
    }
    return rows.sort((a, b) => b.z - a.z);
  }

  /** The live tower: everyone's place and gap to you, F1-style, on screens with room for it. */
  function renderTower() {
    const rows = standings();
    const mine = rows.find((r) => r.you);
    const myZ = mine ? mine.z : 0;
    const mph = GameState.speed;
    ui.tower.innerHTML = rows.map((r, i) => `<li class="${r.you ? 'you' : ''} ${r.cpu ? 'cpu' : ''}" style="--g:${esc(r.color || '#ffd000')}">
      <b>${i + 1}</b><span>${esc(r.name)}</span><em>${r.you ? (r.done ? '🏁' : 'YOU') : r.done ? '🏁' : gapText(r.z - myZ, mph)}</em></li>`).join('');
  }

  function renderWaiting() {
    ui.resTitle.textContent = 'FINISHED! WAITING FOR THE PACK…';
    ui.steps.innerHTML = '';
    ui.steps.hidden = true;
    ui.series.hidden = true;
    const rows = standings();
    ui.podium.innerHTML = rows.map((r, i) => {
      const pct = Math.round((r.z / dist) * 100);
      return `<li class="${r.you ? 'you' : ''}"><b>${MEDAL[i] || i + 1}</b><span>${r.car != null ? thumbHtml(r.car, 'live-thumb live-thumb-s') : ''}${esc(r.name)}${r.cpu ? ' <small>CPU</small>' : ''}</span>
        <em>${r.done ? 'FINISHED' : `<i class="live-bar"><i style="width:${Math.min(100, pct)}%"></i></i>${pct}%`}</em></li>`;
    }).join('');
    paintThumbs(ui.podium);
    ui.rematch.hidden = true;
    ui.resEmotes.hidden = false;
    ui.resStatus.textContent = 'Results land when everyone crosses the line — cheer them on!';
  }

  // ---------- DOM ----------

  function buildDom() {
    const root = document.createElement('div');
    root.id = 'liveRoot';
    root.className = 'live-root';
    root.hidden = true;
    root.innerHTML = `
      <section class="live-card live-menu" data-view="menu" role="dialog" aria-label="Race friends">
        <div class="live-head"><h2>👥 RACE FRIENDS</h2><button class="live-x" data-act="close" aria-label="Close">✕</button></div>
        <button class="live-again" data-act="again" id="liveAgain" hidden></button>
        <div class="live-menu-btns">
          <button class="live-big live-hot" data-act="create" id="liveCreate"><span>🎉 START A ROOM</span><small>Share one link · friends tap to join</small></button>
          <button class="live-big" data-act="quick" id="liveQuick"><span>⚡ QUICK RACE</span><small>Join anyone online · CPU cars fill the grid</small></button>
        </div>
        <form class="live-code-form" data-act="code">
          <label for="liveCodeInput">GOT A CODE?</label>
          <input id="liveCodeInput" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" inputmode="text">
          <button class="live-small" type="submit">JOIN</button>
          <p class="live-hint" id="liveCodeHint" aria-live="polite"></p>
        </form>
      </section>

      <section class="live-card live-lobby" data-view="lobby" role="dialog" aria-label="Room lobby">
        <div class="live-head">
          <div class="live-room"><small>ROOM</small><b id="liveCode">····</b></div>
          <button class="live-small live-invite" data-act="invite" id="liveInvite">📨 INVITE</button>
          <button class="live-x" data-act="leave" aria-label="Leave room">✕</button>
        </div>
        <div class="live-body">
          <div class="live-main">
            <div class="live-spec" id="liveSpec" hidden></div>
            <ol class="live-grid" id="liveGrid"></ol>
          </div>
          <aside class="live-side">
            <figure class="live-qr-wrap" id="liveQrWrap"><canvas id="liveQr" width="232" height="232" aria-label="QR code to join this room"></canvas><figcaption>SCAN TO JOIN</figcaption></figure>
            <button class="live-link" data-act="copy" id="liveLink" aria-label="Copy the invite link"></button>
            <div class="live-cfg" id="liveCfg"></div>
            <p class="live-tip" id="liveTip"></p>
          </aside>
        </div>
        <div class="live-emos" id="liveLobbyEmotes" role="group" aria-label="Quick chat">${emoteButtons('live-emo')}</div>
        <div class="live-foot">
          <p class="live-status" id="liveStatus" aria-live="polite"></p>
          <div class="live-actions">
            <button class="live-big live-hot" data-act="ready" id="liveReady">READY</button>
            <button class="live-small" data-act="start" id="liveStart">START NOW</button>
          </div>
        </div>
      </section>

      <section class="live-card live-results" data-view="results" role="dialog" aria-label="Race results">
        <div class="live-head"><h2 id="liveResTitle">RESULTS</h2><button class="live-x" data-act="leave" aria-label="Leave room">✕</button></div>
        <div class="live-res-body">
          <ol class="live-steps" id="liveSteps" hidden></ol>
          <p class="live-series" id="liveSeries" hidden></p>
          <ol class="live-podium" id="livePodium"></ol>
        </div>
        <div class="live-emos" id="liveResEmotes" role="group" aria-label="Quick chat">${emoteButtons('live-emo')}</div>
        <div class="live-foot">
          <p class="live-status" id="liveResStatus" aria-live="polite"></p>
          <div class="live-actions">
            <button class="live-big live-hot" data-act="rematch" id="liveRematch">🔁 REMATCH</button>
            <button class="live-small" data-act="invite">📨 INVITE</button>
          </div>
        </div>
      </section>

      <section class="live-card live-msg" data-view="msg" role="alertdialog">
        <h2 id="liveMsgTitle"></h2><p id="liveMsgText"></p>
        <div class="live-actions"><button class="live-big live-hot" data-act="create">🎉 NEW ROOM</button><button class="live-small" data-act="leave">BACK</button></div>
      </section>`;
    const overlay = document.createElement('div');
    overlay.className = 'live-countdown';
    overlay.id = 'liveCountdown';
    overlay.hidden = true;
    overlay.innerHTML = '<p class="live-grid-title" id="liveGridTitle"></p><b class="live-count" id="liveCount"></b><ol class="live-callout" id="liveGridList"></ol>';
    // In-race layer: standings tower, emote toasts, quick chat, connection pill.
    const hud = document.createElement('div');
    hud.className = 'live-hud';
    hud.id = 'liveHud';
    hud.innerHTML = `<ol class="live-tower" id="liveTower" aria-label="Live standings"></ol>
      <ol class="live-toasts" id="liveToasts" aria-live="polite"></ol>
      <p class="live-net" id="liveNet" hidden>📶 RECONNECTING…</p>
      <div class="live-chat" id="liveChat" hidden>
        <div class="live-tray" id="liveTray" role="group" aria-label="Quick chat" hidden>${emoteButtons('live-emo-key')}</div>
        <button type="button" class="live-chat-btn" id="liveChatBtn" data-act="tray" aria-label="Quick chat (Y)" aria-expanded="false">💬</button>
      </div>`;
    document.body.append(root, overlay, hud);

    root.addEventListener('click', onClick);
    hud.addEventListener('click', onClick);
    hud.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Laptops: Enter toggles READY in the lobby (not while typing initials or a code).
      if (e.key === 'Enter' && view === 'lobby' && !e.target.closest('input, button')) { e.preventDefault(); onClick({ target: ui.ready }); }
    });
    // Quick chat from the keyboard mid-race: Y opens the tray, 1–7 picks.
    addEventListener('keydown', (e) => {
      if (!(view === 'grid' || view === 'race' || view === 'done') || e.repeat) return;
      if (e.code === 'KeyY') { trayOpen = !trayOpen; renderTray(); e.preventDefault(); return; }
      const n = /^Digit([1-7])$/.exec(e.code);
      if (trayOpen && n) { emote(Number(n[1])); e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    root.querySelector('.live-code-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = root.querySelector('#liveCodeInput');
      const c = cleanCode(input.value);
      const hint = root.querySelector('#liveCodeHint');
      if (c) { hint.textContent = ''; hooks.unlockAudio(); connect(c); return; }
      hint.textContent = input.value.trim() ? 'Room codes are 4 letters with no vowels — like GMPP.' : 'Type the 4-letter code from your friend’s screen.';
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      input.focus();
    });
    return {
      root, overlay, hud,
      count: overlay.querySelector('#liveCount'),
      gridList: overlay.querySelector('#liveGridList'),
      gridTitle: overlay.querySelector('#liveGridTitle'),
      again: root.querySelector('#liveAgain'),
      code: root.querySelector('#liveCode'),
      grid: root.querySelector('#liveGrid'),
      spec: root.querySelector('#liveSpec'),
      cfg: root.querySelector('#liveCfg'),
      tip: root.querySelector('#liveTip'),
      link: root.querySelector('#liveLink'),
      qr: root.querySelector('#liveQr'),
      qrWrap: root.querySelector('#liveQrWrap'),
      status: root.querySelector('#liveStatus'),
      ready: root.querySelector('#liveReady'),
      start: root.querySelector('#liveStart'),
      steps: root.querySelector('#liveSteps'),
      series: root.querySelector('#liveSeries'),
      podium: root.querySelector('#livePodium'),
      resTitle: root.querySelector('#liveResTitle'),
      resStatus: root.querySelector('#liveResStatus'),
      resEmotes: root.querySelector('#liveResEmotes'),
      rematch: root.querySelector('#liveRematch'),
      msgTitle: root.querySelector('#liveMsgTitle'),
      msgText: root.querySelector('#liveMsgText'),
      tower: hud.querySelector('#liveTower'),
      toasts: hud.querySelector('#liveToasts'),
      net: hud.querySelector('#liveNet'),
      chat: hud.querySelector('#liveChat'),
      tray: hud.querySelector('#liveTray'),
      chatBtn: hud.querySelector('#liveChatBtn'),
    };
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'FORM') return;
    const act = b.dataset.act;
    hooks.unlockAudio();
    const mine = room && room.players.find((p) => p.id === me);
    if (act === 'close') { show('off'); hooks.leaveLive(); }
    else if (act === 'create') createRoom();
    else if (act === 'again') raceAgain();
    else if (act === 'quick') quickRace();
    else if (act === 'leave') leave();
    else if (act === 'invite') invite(b);
    else if (act === 'copy') copyLink(b);
    else if (act === 'qr') { qrBig = !qrBig; renderLobby(); }
    else if (act === 'emo') emote(Number(b.dataset.e));
    else if (act === 'tray') { trayOpen = !trayOpen; renderTray(); }
    else if (act === 'ready' || act === 'rematch') {
      if (view === 'results') { show('lobby'); render(); }
      sock && sock.send({ t: 'set', ready: act === 'rematch' ? true : !(mine && mine.ready) });
    } else if (act === 'start') sock && sock.send({ t: 'start' });
    else if (act === 'car') {
      // Step to the next car you own (locked cars are skipped, 0071).
      const n = POP_CULTURE_ROSTER.length;
      const dir = Number(b.dataset.dir);
      let next = GameState.selectedCharIdx | 0;
      for (let i = 0; i < n; i++) {
        next = (next + dir + n) % n;
        if (hooks.selectCar(next) !== false) break;
      }
      sock && sock.send({ t: 'set', car: GameState.selectedCharIdx | 0 });
    } else if (act === 'name') editName();
    else if (act === 'level' || act === 'len') sock && sock.send({ t: 'cfg', [act]: Number(b.dataset.v) });
  }

  function editName() {
    const row = ui.grid.querySelector('.you .live-name');
    if (!row) return;
    const input = document.createElement('input');
    input.className = 'live-name-input';
    input.maxLength = 3;
    input.value = name;
    input.setAttribute('aria-label', 'Your initials');
    input.autocapitalize = 'characters';
    row.replaceWith(input);
    input.focus();
    input.select();
    const done = () => {
      const n = cleanInitials(input.value);
      if (n) {
        name = n;
        SaveStore.data.liveName = n;
        SaveStore.save();
        saveRacerInitials(n);
        sock && sock.send({ t: 'set', name: n });
      }
      render();
    };
    input.addEventListener('blur', done, { once: true });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  async function invite(btn) {
    if (!code) return;
    const r = await shareInvite({ url: roomLink(code), title: 'OUTATIME 88', text: `Race me in OUTATIME 88! Tap to join room ${code} 🏁` });
    const label = btn.textContent;
    if (r === 'copied') { btn.textContent = '✓ LINK COPIED'; setTimeout(() => { btn.textContent = label; }, 1600); }
  }

  async function copyLink(btn) {
    if (!code) return;
    let ok = false;
    try { await navigator.clipboard.writeText(roomLink(code)); ok = true; } catch { /* no clipboard: the share sheet still works */ }
    if (!ok) { invite(ui.root.querySelector('#liveInvite')); return; }
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 1600);
  }

  function show(v) {
    view = v;
    const inRoom = v !== 'off';
    ui.root.hidden = !(v === 'menu' || v === 'lobby' || v === 'results' || v === 'msg' || v === 'done');
    for (const s of ui.root.querySelectorAll('[data-view]')) s.hidden = s.dataset.view !== (v === 'done' ? 'results' : v);
    ui.overlay.hidden = !(v === 'grid' || v === 'race');
    ui.hud.hidden = !(v === 'grid' || v === 'race' || v === 'done');
    ui.tower.hidden = !(v === 'race');
    document.body.classList.toggle('in-live', inRoom);
    if (v === 'menu' || v === 'lobby' || v === 'msg') hooks.hideTitle();
    if (v === 'menu') renderMenu();
    if (v !== 'grid' && v !== 'race' && v !== 'done') trayOpen = false;
    renderTray();
    renderNet();
  }

  function busy(on) {
    for (const b of ui.root.querySelectorAll('.live-menu button')) b.disabled = on;
  }

  function message(title, text) {
    ui.msgTitle.textContent = title;
    ui.msgText.textContent = text;
    if (sock) { sock.close(); sock = null; }
    GameState.liveInvite = null; // the room is gone; don't invite anyone into it
    show('msg');
  }

  function render() {
    if (view === 'lobby') renderLobby();
    else if (view === 'results') renderResults();
  }

  /** RACE AGAIN with your last crew, when there is one. */
  function renderMenu() {
    const crew = loadCrew();
    ui.again.hidden = !crew;
    if (!crew) return;
    const ago = Math.max(1, Math.round((Date.now() - crew.at) / 60000));
    ui.again.innerHTML = `<span class="live-again-icon">🔁</span><span><b>RACE AGAIN</b><small>with ${esc(crewLabel(crew.names))} · ${crew.fresh ? `room ${esc(crew.code)}` : 'new room'} · ${ago < 60 ? `${ago} min ago` : 'earlier'}</small></span>`;
  }

  function renderLobby() {
    ui.code.textContent = code || '····';
    const wide = Math.min(innerWidth, innerHeight) >= 560 && innerWidth >= 700;
    // Phones hide the QR to save room; SHOW QR blows it up so a friend can scan your screen.
    ui.qrWrap.hidden = !code || !(wide || qrBig);
    ui.qrWrap.classList.toggle('big', qrBig && !wide);
    if ((wide || qrBig) && code && ui.qr.dataset.code !== code) { qrToCanvas(roomLink(code), ui.qr, { size: 232 }); ui.qr.dataset.code = code; }
    ui.link.innerHTML = code ? `<span>${esc(roomLink(code).replace(/^https?:\/\//, ''))}</span><b>COPY</b>` : '';
    ui.link.hidden = !code;
    const players = room ? room.players : [];
    const host = room && room.host === me;
    const rows = [];
    let invited = false;
    for (let i = 0; i < LIVE.grid; i++) {
      const p = players[i];
      if (!p) {
        if (!invited && room && !room.public) {
          invited = true;
          rows.push(`<li class="cpu open"><button class="live-seat" data-act="invite"><b>＋</b> INVITE A FRIEND <small>this seat is open</small></button></li>`);
        } else rows.push(`<li class="cpu"><span class="live-thumb live-thumb-empty"></span><span class="live-name">CPU</span><small>fills this seat</small></li>`);
        continue;
      }
      const c = carOf(p.car);
      const you = p.id === me;
      const racing = room.state === 'COUNTDOWN' || room.state === 'RACING';
      const flag = !p.conn ? '<b class="live-flag wait">…</b>' : racing && p.racer ? `<b class="live-flag spec">${p.done ? '🏁 DONE' : '🏎 RACING'}</b>` : p.spectate ? '<b class="live-flag spec">👀 NEXT RACE</b>' : p.ready ? '<b class="live-flag">✓ READY</b>' : '<b class="live-flag no">NOT YET</b>';
      rows.push(`<li class="${you ? 'you' : ''} ${p.conn ? '' : 'gone'} ${p.ready ? 'is-ready' : ''}" style="--g:${esc(c.glow)}">
        ${thumbHtml(p.car)}${bubble(p.id)}
        <span class="live-who">
          <span class="live-tagline">${you ? `<button class="live-name live-edit" data-act="name" aria-label="Change your initials">${esc(p.name)} ✎</button>` : `<span class="live-name">${esc(p.name)}</span>`}
          ${room.host === p.id ? '<i title="Host">👑</i>' : ''}${p.wins ? `<i class="live-wins" title="Wins in this room">★${p.wins}</i>` : ''}</span>
          ${you ? `<span class="live-car"><button data-act="car" data-dir="-1" aria-label="Previous car">◀</button><small>${esc(c.car)}</small><button data-act="car" data-dir="1" aria-label="Next car">▶</button></span>`
                : `<small class="live-carname">${esc(c.car)}</small>`}
        </span>
        ${flag}
      </li>`);
    }
    ui.grid.innerHTML = rows.join('');
    paintThumbs(ui.grid);
    const cfg = room ? room.cfg : { level: 0, len: 0 };
    const chips = (kind, items, cur) => items.map((label, i) =>
      host ? `<button class="live-chip ${i === cur ? 'on' : ''}" data-act="${kind}" data-v="${i}" aria-pressed="${i === cur}">${esc(label)}</button>`
        : (i === cur ? `<span class="live-chip on">${esc(label)}</span>` : '')).join('');
    ui.cfg.innerHTML = `<p>TRACK${host ? '' : ' <small>host picks</small>'}</p><div class="live-chips">${chips('level', WORLD_LEVELS.map(trackName), cfg.level)}</div>
      <p>LENGTH</p><div class="live-chips">${chips('len', LENGTHS.filter((l) => !l.test).map((l) => l.label), cfg.len)}</div>
      ${wide ? '' : `<button class="live-small live-qr-btn" data-act="qr" aria-pressed="${qrBig}">${qrBig ? 'HIDE QR' : '▦ SHOW QR'}</button>`}`;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    ui.tip.textContent = coarse ? '👍 Drag anywhere on the left half to steer · ⚡ WARP when it glows · 💬 to cheer'
      : '⌨️ ←/→ steer · ↑ gas · SHIFT nos · Y then 1–7 to cheer · ENTER = ready';
    const mine = room && players.find((p) => p.id === me);
    ui.ready.textContent = mine && mine.ready ? '✓ READY!' : 'READY';
    ui.ready.classList.toggle('on', !!(mine && mine.ready));
    ui.ready.disabled = !mine || mine.spectate;
    ui.start.hidden = !host || !!(room && room.public);
    ui.start.textContent = players.filter((p) => p.conn).length > 1 ? 'START NOW' : 'START vs CPU';
    renderSpectate();
    renderStatus();
  }

  /** Joined mid-race: watch the room's race live until the next one. */
  function renderSpectate() {
    const watching = !!(room && room.state === 'RACING' && view === 'lobby');
    ui.spec.hidden = !watching;
    if (!watching) return;
    const len = LENGTHS[room.cfg.len].dist;
    const rows = room.players.filter((p) => p.racer).map((p) => ({ name: p.name, z: p.done ? len : (specZ.get(p.slot) || 0), done: p.done, car: p.car }))
      .sort((a, b) => b.z - a.z);
    ui.spec.innerHTML = `<p>🔴 LIVE NOW · ${esc(trackName(WORLD_LEVELS[room.cfg.level]))}</p><ol>${rows.map((r, i) =>
      `<li><b>${i + 1}</b><span>${esc(r.name)}</span><i class="live-bar"><i style="width:${Math.min(100, (r.z / len) * 100).toFixed(1)}%;--g:${esc(carOf(r.car).glow)}"></i></i><em>${r.done ? '🏁' : Math.round((r.z / len) * 100) + '%'}</em></li>`).join('')}</ol>`;
  }

  function renderStatus() {
    if (!ui.status) return;
    const net = ui.root.dataset.net;
    let s = '';
    if (net === 'connecting') s = 'Connecting…';
    else if (net === 'reconnecting') s = 'Reconnecting… your seat is saved.';
    else if (room) {
      const here = room.players.filter((p) => p.conn);
      const mine = room.players.find((p) => p.id === me);
      const autoIn = room.autoAt ? Math.max(0, Math.ceil((room.autoAt - sock.now()) / 1000)) : 0;
      const ready = here.filter((p) => p.ready && !p.spectate).length;
      const eligible = here.filter((p) => !p.spectate).length;
      if (mine && mine.spectate) s = 'Race in progress — you’re on the grid for the next one.';
      else if (room.state === 'COUNTDOWN' || room.state === 'RACING') s = 'Race in progress…';
      else if (autoIn) s = room.public ? `Quick race starts in ${autoIn}s — CPU cars fill empty seats` : `🚦 Everyone’s ready — lights in ${autoIn}s`;
      else if (here.length < 2) s = 'Tap 📨 INVITE and send the link — or start vs CPU.';
      else s = `${ready}/${eligible} ready${room.host === me ? ' — tap START NOW any time' : ' — race starts when everyone’s ready'}`;
    }
    ui.status.textContent = s;
    renderNet();
  }

  function renderNet() {
    if (!ui.net) return;
    ui.net.hidden = !(ui.root.dataset.net === 'reconnecting' && (view === 'grid' || view === 'race' || view === 'done'));
  }
  setInterval(() => { if (view === 'lobby') renderStatus(); }, 500);
  addEventListener('resize', () => { if (view === 'lobby') renderLobby(); });

  function showResults() {
    if (GameState.status === 'PLAYING' || GameState.status === 'GRID') GameState.status = 'LIVE_DONE';
    show('results');
    renderResults();
    rememberRivals(room.players.filter((p) => p.racer).map((p) => p.pub));
    const mine = room.results.find((r) => r.id === me);
    if (mine) callout(mine.place === 1 ? '🏆 WINNER!' : `🏁 ${PLACE[mine.place - 1]} PLACE`, room.results.slice(0, 3).map((r, i) => `${MEDAL[i]} ${r.name}`).join('  '), 2600);
  }

  function renderResults() {
    if (!room || !room.results) { renderLobby(); return; }
    ui.resTitle.textContent = `RACE ${room.race} RESULTS`;
    const res = room.results;
    const best = res[0] && res[0].ms != null ? res[0].ms : null;
    // The top three on a podium: 2nd · 1st · 3rd.
    const top = [res[1], res[0], res[2]].filter(Boolean);
    ui.steps.hidden = top.length < 2;
    ui.steps.innerHTML = top.map((r) => `<li class="p${r.place} ${r.id === me ? 'you' : ''}" style="--g:${esc(carOf(r.car).glow)}">
      ${bubble(r.id)}${thumbHtml(r.car, 'live-thumb live-thumb-l')}<b>${MEDAL[r.place - 1]}</b><span>${esc(r.name)}</span><i class="live-step">${r.place}</i></li>`).join('');
    paintThumbs(ui.steps);
    const series = seriesScore(room.players, me);
    ui.series.hidden = !series.length || room.race < 2;
    ui.series.innerHTML = `SERIES · ${series.map((x) => `<b class="${x.you ? 'you' : ''}">${esc(x.name)} ★${x.wins}</b>`).join(' ')}`;
    ui.podium.innerHTML = res.map((r) => {
      const p = room.players.find((q) => q.id === r.id);
      // Gap in the same hundredths the times are shown in, so 0:04.83 → 0:04.84 reads +0.01.
      const gap = r.ms != null && best != null && r.place > 1 ? `<small class="live-gap">+${((Math.round(r.ms / 10) - Math.round(best / 10)) / 100).toFixed(2)}</small>` : '';
      return `<li class="${r.id === me ? 'you' : ''} ${r.place <= 3 ? 'p' + r.place : ''}"><b>${MEDAL[r.place - 1] || r.place}</b><span>${esc(r.name)}${r.cpu ? ' <small>CPU</small>' : ''}${p && p.wins ? ` <i class="live-wins">★${p.wins}</i>` : ''}${p && p.ready ? ' <i class="live-rdy">✓</i>' : ''}${r.cpu ? '' : bubble(r.id)}</span><em>${fmtTime(r.ms)}${gap}</em></li>`;
    }).join('');
    ui.rematch.hidden = false;
    ui.resEmotes.hidden = false;
    const mine = room.players.find((p) => p.id === me);
    ui.rematch.textContent = mine && mine.ready ? '✓ READY!' : '🔁 REMATCH';
    ui.rematch.classList.toggle('on', !!(mine && mine.ready));
    const readyNames = room.players.filter((p) => p.conn && p.ready).map((p) => p.name);
    ui.resStatus.textContent = room.public ? 'Next quick race starts automatically.'
      : readyNames.length ? `${readyNames.join(', ')} ${readyNames.length === 1 ? 'wants' : 'want'} a rematch!` : 'Tap REMATCH — the room stays together.';
  }

  return {
    ghosts,
    get active() { return GameState.mode === 'LIVE' && !!raceNo; },
    /** World Z of the finish line (for the 2D renderer's checkered band), 0 when not racing live. */
    get finishZ() {
      if (GameState.mode !== 'LIVE' || !raceNo) return 0;
      return GameState.trackPos + ROAD_CFG.playerZOffset + (dist - GameState.distance) * UNITS_PER_MPH;
    },
    get inRoom() { return !!sock; },
    get room() { return room; },
    /** e2e only (via ?debug): raw message to the room. */
    debugSend: (m) => !!sock && sock.send(m),
    /** Quick chat (also the e2e hook): emote 1–7. */
    emote,
    openMenu() { show('menu'); },
    join: (c) => { const ok = cleanCode(c); if (ok) connect(ok); return !!ok; },
    frame,
    update,
    wrecked,
    finished: finished_,
    leave,
    clockText() {
      if (!sock || !startAt) return '0:00';
      const s = Math.max(0, (sock.now() - startAt) / 1000);
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    },
  };
}
