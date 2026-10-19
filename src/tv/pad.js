// TV mode, the phone end (ticket 0175): /outatime/pad.html (the TV's QR opens ?pad=CODE,
// which index.html forwards here). The phone is only a controller: it reads the tilt sensor
// and the buttons, streams compact input frames to the TV (src/tv/proto.js) over WebRTC when
// it can and the relay when it can't, and shows the TV's mini HUD and rumble. It never runs
// the game, so it stays cool and the battery lasts.

import './pad.css';
import '@fontsource/orbitron/latin-700.css';
import { createPadLink } from './link.js';
import { encodeInput, decodeHud, tapped, wheelAngle, wheelSteer, smooth, RATE } from './proto.js';
import { createHaptics } from '../touch/haptics.js';

const $ = (id) => document.getElementById(id);
const pad = $('pad');
const cleanCode = (s) => { const c = String(s || '').trim().toUpperCase(); return /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(c) ? c : null; };
const show = (state) => { pad.dataset.state = state; };
const haptics = createHaptics({ settings: () => ({ haptics: true, hapticStrength: 1 }) });

const ERRORS = {
  NO_CODE: 'That code isn’t on any TV. Check the letters on the screen.',
  NO_TV: 'The TV isn’t connected right now. Reload the TV page and scan again.',
  EXPIRED: 'That code expired. The TV shows a fresh one: scan it again.',
  FULL: 'Two phones are already connected to that TV.',
};

$('padTvUrl').textContent = `${location.host}${import.meta.env.BASE_URL}?tv`;

const input = { seq: 0, steer: 0, gas: false, brake: false, nos: false, hover: false, boostN: 0, startN: 0, fitN: 0, ms: 0, echo: 0 };
let link = null, code = null, tvEcho = 0, rtt = 0, lastRumble = null;
let zero = 0, raw = 0, haveTilt = false, dragX = null, dragZero = 0;

// ── join ──
function begin(c, typed = false) {
  code = c;
  $('padCodeShow').textContent = c;
  show('arm');
  // A typed code goes in the URL too, so a reload reconnects to the same TV.
  if (typed) try { history.replaceState(null, '', `${location.pathname}?pad=${c}`); } catch { /* sandboxed */ }
}
$('padForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = cleanCode($('padCodeIn').value);
  if (c) begin(c, true); else $('padJoinErr').textContent = 'Codes are 4 letters, like BCDF.';
});
const fromUrl = cleanCode(new URLSearchParams(location.search).get('pad'));
if (fromUrl) begin(fromUrl); else show('join');

// ── arm: everything that needs a tap happens inside this one ──
$('padGo').addEventListener('click', async () => {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try { await DOE.requestPermission(); } catch { /* denied: drag steering still works */ }
  }
  window.addEventListener('deviceorientation', onTilt, true);
  wake();
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* iPhone: no fullscreen API */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed outside fullscreen */ }
  haptics.pulse('press');
  show('drive');
  connect();
  setTimeout(() => { if (!haveTilt) $('padSteerHint').textContent = 'DRAG HERE TO STEER'; }, 1500);
  requestAnimationFrame(loop);
});

let lock = null;
async function wake() {
  try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && pad.dataset.state === 'drive') wake(); });

function connect() {
  link = createPadLink({
    code,
    // Whatever the TV end sends is untrusted: only decodeHud's whitelisted fields (numbers and
    // enum strings) are ever shown, always via textContent; anything else is dropped.
    onFrame(d) {
      const h = decodeHud(d);
      if (!h) return;
      if (h.echo) rtt = Math.max(0, (Date.now() % 1e9) - h.echo);
      tvEcho = h.ms;
      hud(h);
    },
    onState(st, detail) {
      if (st === 'error') {
        link.close();
        show('join');
        $('padJoinErr').textContent = Object.hasOwn(ERRORS, detail) ? ERRORS[detail] : 'Couldn’t connect to the TV.';
        return;
      }
      status(st, detail);
      // A frame right away gives the TV this phone's tap-counter baseline before any tap.
      if (st === 'paired' || st === 'p2p') send(performance.now(), true);
    },
  });
}

const LABEL = { connecting: 'connecting…', paired: 'connected · relay', p2p: 'connected · direct', 'tv-gone': 'TV disconnected — waiting…', down: 'reconnecting…' };
let linkState = 'connecting';
function status(st, slot) {
  linkState = st;
  pad.dataset.link = st;
  const who = link && link.slot >= 0 ? `P${link.slot + 1}${link.slot ? ' CO-PILOT' : ''} · ` : '';
  $('padStatus').textContent = `${who}${LABEL[st] || st}${rtt && (st === 'p2p' || st === 'paired') ? ` · ${rtt | 0} ms` : ''}`;
  if (slot === 1) pad.classList.add('copilot');
}

function hud(h) {
  $('padMph').textContent = String(h.mph);
  $('padHp').style.width = `${Math.max(0, Math.min(100, (h.hp / (h.hpMax || 100)) * 100))}%`;
  $('padCoins').textContent = `⚡ ${h.coins}`;
  $('padStart').textContent = h.status === 'PLAYING' ? '❚❚ PAUSE' : h.status === 'PAUSED' ? '▶ RESUME' : '▶ START';
  if (lastRumble != null && tapped(lastRumble, h.rumbleN) && h.rumble) haptics.pulse(h.rumble);
  lastRumble = h.rumbleN;
}

// ── steering: tilt like a wheel, or drag on the wheel strip ──
function screenDeg() {
  const a = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : Number(window.orientation) || 0;
  return ((a % 360) + 360) % 360;
}
function onTilt(e) {
  if (e.beta == null && e.gamma == null) return;
  const deg = wheelAngle(e.beta, e.gamma, screenDeg());
  if (!haveTilt) { haveTilt = true; zero = deg; $('padSteerHint').textContent = 'TILT TO STEER'; }
  raw = deg;
}
function recenter() { zero = raw; haptics.pulse('tick'); }
$('padCenter').addEventListener('click', recenter);
window.addEventListener('orientationchange', () => setTimeout(recenter, 400));

const wheel = $('padWheel');
wheel.addEventListener('pointerdown', (e) => { dragX = e.clientX; dragZero = e.clientX; wheel.setPointerCapture(e.pointerId); });
wheel.addEventListener('pointermove', (e) => { if (dragX != null) dragX = e.clientX; });
const endDrag = () => { dragX = null; };
wheel.addEventListener('pointerup', endDrag);
wheel.addEventListener('pointercancel', endDrag);

// ── buttons: holds are state, taps are counters (src/tv/proto.js) ──
for (const el of document.querySelectorAll('[data-hold]')) {
  const key = el.dataset.hold;
  const on = (e) => { e.preventDefault(); input[key] = true; el.classList.add('down'); haptics.pulse('press'); };
  const off = () => { input[key] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
const tap = (id, key, pulse = 'press') => $(id).addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input[key] = (input[key] + 1) % 256;
  haptics.pulse(pulse);
  send(performance.now(), true);
});
tap('padBoost', 'boostN', 'boost');
tap('padStart', 'startN');
tap('padFit', 'fitN', 'tick');

// ── send loop ──
let sentAt = 0, sent = '';
function send(now, force = false) {
  if (!link) return;
  const relay = link.path !== 'p2p';
  input.seq = (input.seq + 1) >>> 0;
  input.ms = Date.now() % 1e9;
  input.echo = tvEcho;
  const frame = encodeInput(input);
  // The relay is billed per message: send on change (≤30 Hz) plus a keep-alive.
  const key = `${frame[2]}|${frame[3]}|${frame[4]}|${frame[5]}|${frame[8]}`;
  const gap = now - sentAt;
  if (!force) {
    if (relay && key === sent && gap < RATE.keepAliveMs) { input.seq = (input.seq - 1) >>> 0; return; }
    if (gap < 1000 / (relay ? RATE.relayHz : RATE.p2pHz) - 2) { input.seq = (input.seq - 1) >>> 0; return; }
  }
  link.send(frame);
  sentAt = now;
  sent = key;
}

let shown = 0;
function loop(now) {
  let s;
  if (dragX != null) s = Math.max(-1, Math.min(1, (dragX - dragZero) / (wheel.clientWidth * 0.35)));
  else s = haveTilt ? wheelSteer(raw, zero) : 0;
  input.steer = smooth(input.steer, s);
  if (Math.abs(input.steer) < 0.004) input.steer = 0;
  send(now);
  if (now - shown > 33) {
    shown = now;
    $('padDot').style.left = `${(50 + input.steer * 46).toFixed(1)}%`;
    if (linkState === 'p2p' || linkState === 'paired') status(linkState);
  }
  requestAnimationFrame(loop);
}

if (new URLSearchParams(location.search).has('debug')) window.__PAD = { input, get link() { return link; }, setTilt: (deg) => { haveTilt = true; raw = deg; } };
