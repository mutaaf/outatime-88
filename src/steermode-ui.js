// Steering-mode switch (ticket 0130): K cycles how you steer, I cycles the co-pilot, a pill
// under the HUD gear does both (tap = next mode, long-press or right-click = a compact
// picker), gamepad BACK / L3 do the same, and the settings panel has a STEERING row. The
// rules (which modes this device has, mouse steering, live-race limits) are in src/steermode.js.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { InputState } from './input.js';
import {
  STEER_MODES, ASSISTS, availableModes, resolveMode, nextMode, assistById, effectiveAssist,
  nextAssist, savedAssist, mouseSteer, touchMovementFor,
} from './steermode.js';

const $ = (id) => document.getElementById(id);
const LONG_PRESS_MS = 450;

/**
 * @param {object} o
 * @param {(title:string, sub:string, ms:number) => void} o.announce
 * @param {(on:boolean) => Promise<boolean>} o.toggleTilt
 * @param {() => void} o.recenterTilt
 * @param {() => any} o.touch the touch kit's bridge (or null before it loads)
 */
export function initSteerModes({ announce, toggleTilt, recenterTilt, touch }) {
  const win = window;
  const mm = (q) => Boolean(win.matchMedia && win.matchMedia(q).matches);
  const hasTouch = 'ontouchstart' in win || (navigator.maxTouchPoints || 0) > 0;
  const env = { fine: mm('(any-pointer: fine)') || !hasTouch, touch: hasTouch, tilt: hasTouch && 'DeviceOrientationEvent' in win };
  const modes = availableModes(env);
  const S = () => SaveStore.data.settings;
  const live = () => GameState.mode === 'LIVE';
  let mode = resolveMode(S().steer, modes, env);
  let assist = savedAssist(S(), SaveStore.data.controls);

  // --- Modes ------------------------------------------------------------------------------

  function setMovement(m) {
    const c = SaveStore.data.controls;
    if (!c) return;
    c.movement = touchMovementFor(m, c.movement);
    const t = touch();
    if (t) t.controls.applySettings();
  }

  /** Switch steering mode. `quiet` skips the toast (startup). */
  function setMode(m, { quiet = false } = {}) {
    if (!modes.includes(m)) return;
    const was = mode;
    mode = m;
    S().steer = m;
    InputState.mouseSteerVal = 0;
    if (m === 'tilt' && !InputState.tiltEnabled) {
      // Runs inside the key press / tap, which iOS needs for its motion-permission prompt.
      Promise.resolve(toggleTilt(true)).then((ok) => {
        if (ok) return;
        announce('📱 TILT IS BLOCKED', 'ALLOW MOTION IN SETTINGS · USING THE STICK', 1600);
        sync(true);
      });
    }
    else if (m !== 'tilt' && was === 'tilt' && InputState.tiltEnabled) toggleTilt(false);
    if (env.touch) setMovement(m);
    SaveStore.save();
    sync(true);
    if (!quiet) {
      const d = STEER_MODES[m];
      announce(`${d.icon} STEERING: ${d.label}`, `${d.hint} · K TO SWITCH`, 1100);
    }
  }

  const cycleMode = (dir = 1) => setMode(nextMode(current(), modes, dir));

  /** The mode in effect: tilt and the touch D-pad can also be switched on elsewhere. */
  function current() {
    if (InputState.tiltEnabled && modes.includes('tilt')) return 'tilt';
    if (mode === 'keys' || mode === 'mouse') return mode;
    const c = SaveStore.data.controls;
    if (env.touch && c && c.movement === 'dpad') return 'dpad';
    // Tilt switched off (or blocked) elsewhere, or the D-pad swapped out in the touch panel.
    if (mode === 'tilt' || mode === 'dpad') return resolveMode('', modes, env);
    return mode;
  }

  // --- Assist -----------------------------------------------------------------------------

  function applyAssist() {
    const a = assistById(effectiveAssist(assist, live()));
    GameState.jarvisMode = a.jarvis;
    const c = SaveStore.data.controls;
    if (c) c.steerAssist = a.id === 'assist';
    const legacy = $('btnJarvisMode');
    if (legacy) legacy.textContent = `${a.icon} AI: ${a.label} (I)`;
  }

  function setAssist(id, { quiet = false } = {}) {
    assist = id;
    S().assist = id;
    applyAssist();
    SaveStore.save();
    sync(true);
    if (!quiet) {
      const a = assistById(effectiveAssist(id, live()));
      announce(`${a.icon} ${a.label}`, `${a.hint} · I TO SWITCH`, 1100);
    }
  }

  const cycleAssist = () => setAssist(nextAssist(effectiveAssist(assist, live()), { live: live() }));

  // --- Mouse steering ---------------------------------------------------------------------

  win.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || current() !== 'mouse') return;
    InputState.mouseSteerVal = GameState.status === 'PLAYING' ? mouseSteer(e.clientX, win.innerWidth) : 0;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { InputState.mouseSteerVal = 0; });
  win.addEventListener('blur', () => { InputState.mouseSteerVal = 0; });

  // --- HUD pill and picker ----------------------------------------------------------------

  const pill = $('btnSteerMode');
  let picker = null;
  let pressTimer = 0;
  let longFired = false;

  function buildPicker() {
    picker = document.createElement('div');
    picker.id = 'steerPicker';
    picker.className = 'steer-picker hidden';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Steering and assist');
    picker.innerHTML = `<div class="sp-label">STEERING · K</div><div class="sp-row">${modes.map((m) =>
      `<button type="button" data-steer-mode="${m}">${STEER_MODES[m].icon}<b>${STEER_MODES[m].label}</b></button>`).join('')}</div>`
      + `<div class="sp-label">CO-PILOT · I</div><div class="sp-row">${ASSISTS.map((a) =>
        `<button type="button" data-assist="${a.id}">${a.icon}<b>${a.label}</b></button>`).join('')}</div>`
      + (modes.includes('tilt') ? '<button type="button" class="sp-recenter" data-act="recenter">🎯 RECENTER TILT</button>' : '');
    document.body.appendChild(picker);
    picker.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.steerMode) setMode(b.dataset.steerMode);
      else if (b.dataset.assist) setAssist(b.dataset.assist);
      else if (b.dataset.act === 'recenter') recenterTilt();
      closePicker();
    });
    picker.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') closePicker(); });
  }

  function openPicker() {
    if (!picker) buildPicker();
    sync(false);
    const r = pill.getBoundingClientRect();
    picker.classList.remove('hidden');
    const w = picker.offsetWidth;
    picker.style.left = `${Math.round(Math.max(8, Math.min(win.innerWidth - w - 8, r.right - w)))}px`;
    picker.style.top = `${Math.round(r.bottom + 6)}px`;
    const first = picker.querySelector('[aria-pressed="true"]') || picker.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  function closePicker() {
    if (!picker) return;
    picker.classList.add('hidden');
    document.removeEventListener('pointerdown', outside, true);
  }
  function outside(e) { if (picker && !picker.contains(e.target) && e.target !== pill) closePicker(); }

  if (pill) {
    pill.addEventListener('pointerdown', () => {
      longFired = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { longFired = true; openPicker(); }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(pressTimer);
    pill.addEventListener('pointerup', cancel);
    pill.addEventListener('pointercancel', cancel);
    pill.addEventListener('pointerleave', cancel);
    pill.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(pressTimer); longFired = true; openPicker(); });
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (longFired) { longFired = false; return; }
      cycleMode();
    });
  }

  // --- Settings panel row (static markup in index.html; the panel chunk never needs to know) --

  const modal = $('settingsModal');
  if (modal) {
    for (const b of modal.querySelectorAll('[data-steer-mode]')) b.classList.toggle('hidden', !modes.includes(b.dataset.steerMode));
    modal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-steer-mode], [data-assist]');
      if (!b || !modal.contains(b)) return;
      if (b.dataset.steerMode) setMode(b.dataset.steerMode, { quiet: true });
      else setAssist(b.dataset.assist, { quiet: true });
    });
  }

  /** Pill, picker and settings buttons show the current mode; `flash` pulses the pill. */
  function sync(flash) {
    const m = current();
    const a = assistById(effectiveAssist(assist, live()));
    if (pill) {
      const d = STEER_MODES[m];
      pill.innerHTML = `<span aria-hidden="true">${d.icon}</span><b>${d.label}</b>${a.id === 'off' ? '' : `<i aria-hidden="true">${a.icon}</i>`}`;
      pill.dataset.mode = m;
      pill.dataset.assist = a.id;
      pill.setAttribute('aria-label', `Steering: ${d.label}, ${a.label}. Tap to switch, hold for more.`);
      if (flash) {
        pill.classList.remove('is-flash');
        void pill.offsetWidth; // restart the animation
        pill.classList.add('is-flash');
      }
    }
    for (const root of [picker, modal]) {
      if (!root) continue;
      for (const b of root.querySelectorAll('[data-steer-mode]')) b.setAttribute('aria-pressed', String(b.dataset.steerMode === m));
      for (const b of root.querySelectorAll('[data-assist]')) {
        b.setAttribute('aria-pressed', String(b.dataset.assist === a.id));
        b.disabled = live() && b.dataset.assist === 'auto';
      }
    }
  }

  // --- Gamepad: BACK cycles steering, L3 (stick click) cycles the co-pilot ------------------

  let padBack = false, padL3 = false;
  function gamepad(gp) {
    if (gp.back && !padBack) cycleMode();
    if (gp.l3 && !padL3) cycleAssist();
    padBack = Boolean(gp.back);
    padL3 = Boolean(gp.l3);
  }

  // Startup: put the saved mode into effect without a toast (tilt waits for a tap on iOS,
  // which src/settings-ui.js already handles).
  if (env.touch && mode !== 'tilt' && SaveStore.data.controls && S().steer) setMovement(mode);
  applyAssist();
  sync(false);

  return {
    cycleMode, cycleAssist, setMode, setAssist, gamepad, sync, openPicker, closePicker,
    get mode() { return current(); },
    get assist() { return effectiveAssist(assist, live()); },
    modes,
    /** A race is starting: live races drop AUTOPILOT; the pill pulses so you see your mode. */
    raceStart() { applyAssist(); sync(true); },
  };
}
