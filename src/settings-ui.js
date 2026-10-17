// Settings panel + tilt steering (ticket 0050). One panel, reachable from a gear on the
// title and in the race HUD (opening it mid-race pauses); a one-tap TILT chip on the title.
// The rules live in src/settings.js; this module wires them to the DOM, SaveStore,
// SoundEngine and InputState.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { InputState } from './input.js';
import { SoundEngine } from './audio.js';
import { normalizeSettings, reducedMotionFor, screenAngle, tiltAngle, tiltSteer, tiltStatusText, difficultyOf } from './settings.js';

const $ = (id) => document.getElementById(id);
let tiltStatus = 'off';
let systemReduce = false;
let resumeOnClose = false;
let gotSignal = false;
let signalTimer = 0;
let hooks = { announce() {} };

export const settings = () => SaveStore.data.settings;
export const currentDifficulty = () => difficultyOf(SaveStore.data.settings);
export const settingsOpen = () => !$('settingsModal').classList.contains('hidden');
export const getTiltStatus = () => tiltStatus;

function save() { SaveStore.save(); }

// --- Tilt ---------------------------------------------------------------------------------

function onOrientation(e) {
  if (e.beta == null && e.gamma == null) return;
  if (!gotSignal) {
    gotSignal = true;
    clearTimeout(signalTimer);
    InputState.tiltZeroOffset = tiltAngle(e.beta, e.gamma, screenAngle(window));
    setTiltStatus('on');
  }
  if (!InputState.tiltEnabled) return;
  const raw = tiltAngle(e.beta, e.gamma, screenAngle(window));
  InputState.tiltRawAngle = raw;
  InputState.tiltSteerVal = tiltSteer(raw, InputState.tiltZeroOffset, {
    sensitivity: SaveStore.data.tiltSensitivity || 1,
    invert: settings().tiltInvert,
  });
  const pct = Math.max(6, Math.min(94, 50 + InputState.tiltSteerVal * 44));
  for (const id of ['tiltIndicatorDot', 'setTiltDot']) {
    const dot = $(id);
    if (dot) dot.style.left = `${pct}%`;
  }
}

function setTiltStatus(status) {
  tiltStatus = status;
  const on = status === 'on' || status === 'waiting';
  InputState.tiltEnabled = on;
  if (!on) InputState.tiltSteerVal = 0;
  const sw = $('setTilt');
  if (sw) sw.setAttribute('aria-checked', String(on));
  const st = $('tiltStatus');
  if (st) { st.textContent = tiltStatusText(status); st.dataset.status = status; }
  const chip = $('btnTitleTilt');
  if (chip) {
    chip.setAttribute('aria-pressed', String(on));
    chip.querySelector('b').textContent = on ? 'ON' : (status === 'denied' || status === 'unsupported' || status === 'nosignal' ? 'N/A' : 'OFF');
  }
  for (const id of ['setTiltRecenter', 'setTiltMeter']) {
    const el = $(id);
    if (el) el.classList.toggle('is-off', status !== 'on');
  }
  const legacy = $('btnTiltToggle');
  if (legacy) legacy.textContent = on ? 'TILT: ON' : 'TILT: OFF';
  const hud = $('tiltHudBar');
  if (hud) hud.classList.toggle('hidden', status !== 'on');
}

/**
 * Turns tilt on. Must run inside the tap that asked for it: iOS only shows its motion
 * permission prompt from a user gesture, and requestPermission is the first await here.
 */
export async function enableTilt() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) { setTiltStatus('unsupported'); return false; }
  if (typeof DOE.requestPermission === 'function') {
    let resp = 'denied';
    try { resp = await DOE.requestPermission(); } catch (e) { resp = 'denied'; }
    if (resp !== 'granted') { setTiltStatus('denied'); return false; }
  }
  window.removeEventListener('deviceorientation', onOrientation, true);
  window.addEventListener('deviceorientation', onOrientation, true);
  gotSignal = false;
  setTiltStatus('waiting');
  clearTimeout(signalTimer);
  signalTimer = setTimeout(() => { if (!gotSignal) setTiltStatus('nosignal'); }, 1500);
  settings().tilt = true;
  save();
  return true;
}

export function disableTilt() {
  window.removeEventListener('deviceorientation', onOrientation, true);
  clearTimeout(signalTimer);
  settings().tilt = false;
  save();
  setTiltStatus('off');
}

export function toggleTilt(force) {
  const want = typeof force === 'boolean' ? force : !InputState.tiltEnabled;
  if (want) return enableTilt();
  disableTilt();
  return Promise.resolve(false);
}

export function recenterTilt() {
  InputState.tiltZeroOffset = InputState.tiltRawAngle || 0;
  InputState.tiltSteerVal = 0;
  hooks.announce('📱 TILT CENTERED', 'HOLD IT LIKE THIS TO DRIVE STRAIGHT', 1100);
}

// --- Apply --------------------------------------------------------------------------------

function applyMotion() {
  GameState.reducedMotion = reducedMotionFor(settings().motion, systemReduce);
  document.documentElement.dataset.motion = GameState.reducedMotion ? 'reduce' : 'full';
}

function applyAll() {
  const s = settings();
  applyMotion();
  SoundEngine.setMix(s.musicVolume, s.sfxVolume);
  if (panel) panel.sync();
}


/**
 * The touch-controls editor plugs in here: registering it shows EDIT CONTROLS in the panel,
 * and a tap closes the panel (keeping the race paused) and calls `open()`.
 */
export function registerControlsEditor(open) {
  const b = $('btnEditControls');
  if (!b || typeof open !== 'function') return;
  b.classList.remove('hidden');
  b.onclick = () => {
    $('settingsModal').classList.add('hidden');
    open({ wasRacing: resumeOnClose, resume: () => { if (resumeOnClose && GameState.status === 'PAUSED') GameState.status = 'PLAYING'; resumeOnClose = false; } });
  };
}

/** Called by the master-volume slider elsewhere (garage) and by mute toggles. */
export function refreshSettingsPanel() { if (panel) panel.sync(); }

// --- Panel --------------------------------------------------------------------------------

// The panel's controls are their own chunk (src/settings-panel.js), fetched on first open.
let panel = null;
let panelLoading = null;
const ctx = {
  settings, save, applyAll, toggleTilt, recenterTilt, setTiltStatus,
  get tiltStatus() { return tiltStatus; },
  get resumeOnClose() { return resumeOnClose; },
  set resumeOnClose(v) { resumeOnClose = v; },
};
function loadPanel() {
  panelLoading = panelLoading || import('./settings-panel.js').then((m) => { panel = m.createPanel(ctx); return panel; });
  return panelLoading;
}

export function openSettings() {
  // A live race (sprint 3) can't pause — friends are still driving — so settings open over it.
  resumeOnClose = GameState.status === 'PLAYING' && GameState.mode !== 'LIVE';
  if (resumeOnClose) GameState.status = 'PAUSED';
  return loadPanel().then((p) => p.open());
}

export function closeSettings() {
  $('settingsModal').classList.add('hidden');
  if (resumeOnClose && GameState.status === 'PAUSED' && $('garageModal').classList.contains('hidden')) GameState.status = 'PLAYING';
  resumeOnClose = false;
}

/** Wires the panel, the gears and the title TILT chip. `announce` shows a HUD message. */
export function initSettings({ announce } = {}) {
  if (announce) hooks.announce = announce;
  SaveStore.data.settings = normalizeSettings(SaveStore.data.settings);
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  systemReduce = Boolean(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { systemReduce = e.matches; applyMotion(); });

  const touchCapable = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  const chip = $('btnTitleTilt');
  if (chip) chip.classList.toggle('hidden', !touchCapable);

  for (const id of ['btnOpenSettings', 'btnHudSettings', 'btnSettingsFromGarage']) {
    const b = $(id);
    if (b) b.addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
  }
  $('btnSettingsDone').addEventListener('click', closeSettings);
  $('settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  // While the panel is open the race neither steers nor starts behind it: keys aimed at the
  // panel's own controls stop at the panel; anything else stops before the game sees it.
  window.addEventListener('keydown', (e) => {
    if (!settingsOpen()) return;
    if (e.code === 'Escape') { e.preventDefault(); closeSettings(); e.stopImmediatePropagation(); return; }
    if (!$('settingsModal').contains(e.target)) e.stopImmediatePropagation();
  }, true);
  $('settingsModal').addEventListener('keydown', (e) => e.stopPropagation());

  // A tap on the title chip is the gesture iOS needs for the permission prompt.
  if (chip) chip.addEventListener('click', (e) => { e.stopPropagation(); toggleTilt(); });
  // Tilt was on last visit: Android/desktop resume at once; iOS re-asks on the first tap.
  setTiltStatus('off');
  if (settings().tilt) {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      const once = (e) => {
        window.removeEventListener('click', once, true);
        if (e.target.closest && e.target.closest('#btnTitleTilt, #setTilt')) return; // that tap decides for itself
        if (settings().tilt && !InputState.tiltEnabled) enableTilt(); };
      window.addEventListener('click', once, true);
    } else {
      enableTilt();
    }
  }
  applyAll();
}
