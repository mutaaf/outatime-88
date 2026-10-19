// TV mode, the big-screen end (ticket 0175). /outatime/?screen=tv shows a pairing code and a
// QR; a phone that scans it becomes the controller (src/tv/pad.js). The TV runs the whole
// game — sim, audio, rendering — and the phone only sends input, so the TV's frame rate and
// sound are never at the mercy of the network. Lazy: solo players never download this.
//
// Input lands in PhonePad (src/input.js), the same path a gamepad takes, so steering, gas,
// brake and NOS go through the exact handling model every other control uses. Player 1's
// phone drives; a second phone is the co-pilot (its boost and NOS taps count too).

import './tv.css';
import { GameState } from '../state.js';
import { InputState, PhonePad } from '../input.js';
import { qrToCanvas } from '../qr.js';
import { createTvLink, newPadCode } from './link.js';
import { decodeInput, encodeHud, createPadState, RATE } from './proto.js';

const SAFE_STEPS = [0, 3, 6]; // overscan margin (% of each edge), cycled by the phone's FIT TV
const $ = (id) => document.getElementById(id);

export function padLink(code, loc = location) {
  return `${loc.origin}${import.meta.env.BASE_URL}?pad=${code}`;
}

/** h = { start(): start or retry a race, unlockAudio(), debug: bool } (main.js). */
export function startTv(h) {
  document.body.classList.add('tv-screen');
  const root = document.createElement('div');
  root.id = 'tvRoot';
  root.innerHTML = `
    <section id="tvPair" class="tv-pair" aria-live="polite">
      <div class="tv-pair-card">
        <p class="tv-kicker">PLAY ON THE BIG SCREEN</p>
        <h2 class="tv-title">GRAB YOUR PHONE</h2>
        <div class="tv-pair-row">
          <canvas id="tvQr" width="280" height="280" aria-label="QR code that opens the phone controller"></canvas>
          <ol class="tv-steps">
            <li>Point your phone's camera at the code.</li>
            <li>Or open <b id="tvHost"></b> on your phone and enter</li>
          </ol>
        </div>
        <p id="tvCode" class="tv-code">····</p>
        <p id="tvPairNote" class="tv-note">Getting a code…</p>
        <p id="tvSound" class="tv-sound">🔊 Press OK on the remote (or click) once to turn on the sound</p>
      </div>
    </section>
    <div id="tvChip" class="tv-chip hidden"></div>
    <div id="tvBanner" class="tv-banner hidden"></div>
    <div id="tvDev" class="tv-dev hidden"></div>`;
  document.body.appendChild(root);
  $('tvHost').textContent = `${location.host}${import.meta.env.BASE_URL}pad`;

  const pads = [createPadState(), createPadState()];
  const joined = [false, false];
  let link = null, code = '', expiresAt = 0, pairedOnce = false, pausedByTv = false;
  let safe = 0, rumbleN = 0, rumble = '', last = { hp: GameState.hp, coins: GameState.runCoins, warp: 0 };
  let hudAt = 0, chipTimer = 0;

  function unlock() {
    h.unlockAudio();
    $('tvSound').classList.add('hidden');
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  function setSafe(i) {
    safe = i % SAFE_STEPS.length;
    document.documentElement.style.setProperty('--tv-scale', String(1 - (2 * SAFE_STEPS[safe]) / 100));
  }

  async function pair() {
    if (link) link.close();
    $('tvPairNote').textContent = 'Getting a code…';
    let res;
    try { res = await newPadCode(); } catch {
      $('tvPairNote').textContent = 'TV mode needs an internet connection. Retrying…';
      setTimeout(pair, 5000);
      return;
    }
    code = res.code;
    expiresAt = performance.now() + (res.ttlMs || 600e3);
    $('tvCode').textContent = code;
    qrToCanvas(padLink(code), $('tvQr'), { size: 280 });
    link = createTvLink({
      code,
      onPad(slot, on) {
        joined[slot] = on;
        if (on) { pairedOnce = true; pads[slot].s.at = performance.now(); }
        render();
      },
      onFrame(slot, d) {
        const f = decodeInput(d);
        if (!f) return;
        const now = performance.now();
        const taps = pads[slot].take(f, now, Date.now() % 1e9);
        if (taps.boost) InputState.boostPressed = true;
        if (taps.start) primary();
        if (taps.fit) setSafe(safe + 1);
      },
      onState(st, why) {
        if (st === 'error' && (why === 'NO_CODE')) pair();
        render();
      },
    });
    render();
  }

  // The phone's ▶ button: start / retry from menus, pause and resume during a race.
  function primary() {
    unlockAudioQuiet();
    if (GameState.status === 'PLAYING' && GameState.mode !== 'LIVE') { GameState.status = 'PAUSED'; pausedByTv = true; }
    else if (GameState.status === 'PAUSED') { GameState.status = 'PLAYING'; pausedByTv = false; const g = $('garageModal'); if (g) g.classList.add('hidden'); }
    else h.start();
    render();
  }
  const unlockAudioQuiet = () => { try { h.unlockAudio(); } catch { /* no audio */ } };

  function render() {
    const any = joined[0] || joined[1];
    $('tvPair').classList.toggle('hidden', any);
    // Who's connected: shown for a few seconds when it changes, then out of the way.
    const chip = $('tvChip');
    const who = [0, 1].filter((s) => joined[s]).map((s) => `📱 P${s + 1}${s ? ' CO-PILOT' : ''}`).join('  ·  ');
    if (any && who !== chip.dataset.who) {
      chip.dataset.who = who;
      chip.textContent = `${who} CONNECTED`;
      chip.classList.remove('hidden', 'tv-fade');
      clearTimeout(chipTimer);
      chipTimer = setTimeout(() => chip.classList.add('tv-fade'), 4000);
    }
    if (!any) { chip.classList.add('hidden'); chip.dataset.who = ''; }
    const banner = $('tvBanner');
    const lost = pairedOnce && !joined[0];
    const paused = GameState.status === 'PAUSED' && pausedByTv;
    banner.classList.toggle('hidden', !lost && !paused);
    banner.textContent = lost ? '📱 CONTROLLER DISCONNECTED — reconnecting… (or scan the code again)' : 'PAUSED — press ▶ on your phone';
    if (!any && !pairedOnce) $('tvPairNote').textContent = 'The code works for 10 minutes. Up to 2 phones: the second is your co-pilot.';
  }

  function tick() {
    const now = performance.now();
    const p1 = pads[0].live(now);
    const p2 = pads[1].live(now);
    PhonePad.on = joined[0] || joined[1];
    PhonePad.steer = joined[0] ? p1.steer : 0;
    PhonePad.gas = joined[0] && p1.gas;
    PhonePad.brake = joined[0] && p1.brake;
    PhonePad.nos = (joined[0] && p1.nos) || (joined[1] && p2.nos);
    PhonePad.hover = joined[0] && p1.hover;
    // A phone that stops talking (screen locked, out of range) pauses the race, never drives on.
    if (pairedOnce && (!joined[0] || p1.lost) && GameState.status === 'PLAYING' && GameState.mode !== 'LIVE') {
      GameState.status = 'PAUSED';
      pausedByTv = true;
      render();
    }
    if (!pairedOnce && code && now > expiresAt) pair();
    feedback(now);
    if (h.debug) dev(now);
    requestAnimationFrame(tick);
  }

  // Rumble cues and the phone's mini HUD.
  function feedback(now) {
    const hp = GameState.hp, coins = GameState.runCoins, warp = GameState.warpActiveTimer > 0 ? 1 : 0;
    let kind = '';
    if (hp < last.hp - 0.5) kind = 'hit';
    else if (warp && !last.warp) kind = 'boost';
    else if (coins > last.coins) kind = 'pickup';
    last = { hp, coins, warp };
    if (kind) { rumbleN = (rumbleN + 1) % 256; rumble = kind; }
    for (const slot of [0, 1]) {
      if (!joined[slot]) continue;
      const hz = link.path(slot) === 'p2p' ? RATE.hudHz : RATE.hudHz / 2;
      if (!kind && now - hudAt < 1000 / hz) continue;
      link.send(slot, encodeHud({
        mph: GameState.speed, hp, hpMax: GameState.maxHp, coins, status: GameState.status,
        rumbleN, rumble, ms: Date.now() % 1e9, echo: pads[slot].s.padMs,
      }));
    }
    if (kind || now - hudAt >= 1000 / RATE.hudHz) hudAt = now;
  }

  function dev(now) {
    const el = $('tvDev');
    el.classList.remove('hidden');
    el.textContent = [0, 1].filter((s) => joined[s]).map((s) => {
      const p = pads[s].s;
      return `P${s + 1} ${link.path(s).toUpperCase()} rtt ${p.rtt | 0}ms ${p.hz}Hz age ${Math.round(now - p.at)}ms steer ${p.steer.toFixed(2)}`;
    }).join('\n') || 'no pads';
  }

  const q = new URLSearchParams(location.search);
  setSafe(Math.max(0, SAFE_STEPS.indexOf(Number(q.get('safe')) || 0)));
  pair();
  requestAnimationFrame(tick);
  const api = { get code() { return code; }, pads, joined, get path() { return link ? [link.path(0), link.path(1)] : []; } };
  if (h.debug) window.__OT_TV = api;
  return api;
}
