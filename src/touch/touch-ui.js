// Multi-touch controls (ticket 0061): a Roblox/Fortnite-style thumbstick or D-pad on one side,
// an arc of action buttons on the other, shortcuts, and a free-drag look area.
//
// One full-screen surface owns every touch (Pointer Events, captured per pointer), so any
// number of fingers work at once and a thumb can slide from one button onto the next. Event
// handlers only record state; sample() folds it into InputState once per frame, with no
// allocations, so the sim (and the 3D and multiplayer layers) read input exactly as before.
import { InputState } from '../input.js';
import { stickVector, followThumb, clampToRing, dpadDirection, dpadAxes, smoothSteer } from './stick.js';
import { hitButton, slideTransition } from './buttons.js';
import { presetLayout, applyCustom, layoutKey, ACTION_IDS, SHORTCUT_IDS, PRESETS } from './layouts.js';
import { movementFor } from './settings.js';
import { ICONS, LABELS } from './icons.js';
import { createHaptics } from './haptics.js';
import './touch.css';

const SLIDABLE = new Set(['boost', 'drift', 'jump', 'special', 'accel', 'horn']);
const HOLD = new Set(['drift', 'accel', 'rear', 'horn']);
const SPECIALS = ['ZONE', 'AGRO', 'ROAR'];
const LONG_PRESS_MS = 380;
const FLICK_MS = 260;
const FLICK_PX = 28;
const MAX_POINTERS = 10;
const STICK_TRAVEL = 0.42;   // knob travel radius as a fraction of the base diameter
const EDGE_STEER = 0.75;     // stick deflection that counts as a "press" (tricks, jukes)
const LOOK_RANGE = 0.35;     // fraction of the screen for a full look-around

/** True on devices that can touch; desktop mice never see the controls unless they touch. */
export function canTouch(win = window) {
  return (win.navigator && win.navigator.maxTouchPoints > 0)
    || (typeof win.matchMedia === 'function' && win.matchMedia('(any-pointer: coarse)').matches);
}

/**
 * `settings` is a getter for SaveStore.data.controls, read fresh each time: switching racer on
 * a shared device (0090) swaps the whole save, and the controls must follow.
 */
export function createTouchControls({ doc = document, win = window, settings: S, save, hooks }) {
  const layer = doc.getElementById('touchControlsLayer');
  const root = doc.documentElement;
  const h = Object.assign({
    onBoost() {}, onJump() {}, onDrift() {}, onSpecial() {}, onHorn() {}, onPause() {}, onCamera() {},
    onRespawn() {}, onSteerEdge() {}, onSteerStart() {}, onFlick() {}, onTiltRecenter() {}, tiltOn: () => false,
    is3D: () => false, status: () => null, drawMirror() {}, canPlay: () => true, calm: () => false,
  }, hooks);

  // --- DOM ----------------------------------------------------------------------------------
  layer.innerHTML = '';
  layer.className = 'tc-layer';
  layer.setAttribute('aria-label', 'Touch controls');
  const el = {};
  const ring = {};
  const mk = (tag, cls, parent = layer) => { const e = doc.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; };

  const zoneHint = mk('div', 'tc-zone-hint');
  zoneHint.id = 'tcZoneHint';
  const stick = mk('div', 'tc-stick');
  stick.id = 'tcStick';
  const stickBase = mk('div', 'tc-stick-base', stick);
  const knob = mk('div', 'tc-stick-knob', stick);
  stickBase.innerHTML = '<i></i><i></i><i></i><i></i>';
  const dpad = mk('div', 'tc-dpad');
  dpad.id = 'tcDpad';
  dpad.innerHTML = ['n', 'e', 's', 'w'].map((d) => `<span class="tc-dpad-arrow tc-${d}">${ICONS.chevron}</span>`).join('');
  const tilt = mk('div', 'tc-btn tc-tilt');
  tilt.id = 'tcTilt';
  tilt.setAttribute('role', 'button');
  tilt.setAttribute('aria-label', 'Re-centre tilt steering');
  tilt.innerHTML = `<span class="tc-ico">${ICONS.recenter}</span><span class="tc-lbl">TILT · CENTER</span>`;

  for (const id of [...ACTION_IDS, ...SHORTCUT_IDS]) {
    const b = mk('div', `tc-btn tc-${id}${SHORTCUT_IDS.includes(id) ? ' tc-shortcut' : ''}${id === 'boost' ? ' tc-primary' : ''}`);
    b.id = `tc${id[0].toUpperCase()}${id.slice(1)}`;
    b.dataset.ctl = id;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', LABELS[id]);
    const hasRing = id === 'boost' || id === 'respawn' || id === 'special';
    b.innerHTML = (hasRing ? '<svg class="tc-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle class="tc-ring-fill" cx="50" cy="50" r="46" pathLength="100"/></svg>' : '')
      + `<span class="tc-ico">${ICONS[id]}</span><span class="tc-lbl">${LABELS[id]}</span>`
      + (id === 'special' ? '<span class="tc-badge">0</span>' : '');
    el[id] = b;
    if (hasRing) ring[id] = { fill: b.querySelector('.tc-ring-fill'), last: -1 };
  }
  el.boost.dataset.ready = 'false';
  const specialBadge = el.special.querySelector('.tc-badge');
  const picker = mk('div', 'tc-picker');
  picker.id = 'tcPicker';
  picker.innerHTML = SPECIALS.map((s) => `<span data-special="${s}">${ICONS[s.toLowerCase()]}<b>${s}</b></span>`).join('');
  const mirror = mk('canvas', 'tc-mirror');
  mirror.id = 'tcMirror';
  mirror.width = 360; mirror.height = 96;
  const mirrorCtx = mirror.getContext('2d');

  // --- State --------------------------------------------------------------------------------
  let active = false;        // controls shown (touch device, racing or editing)
  let editing = false;
  let layout = {};
  let env = null;
  let side = 'left';         // stick side
  // Tilt is switched on and off by the settings panel (src/settings-ui.js); while it is on, the
  // stick side becomes a big RECENTER button. Otherwise the chosen stick/D-pad mode applies.
  const effectiveMovement = () => (h.tiltOn() ? 'tilt' : movementFor(S()) === 'tilt' ? (PRESETS[S().preset] || PRESETS.default).movement : movementFor(S()));
  let movement = effectiveMovement();
  let tiltWas = h.tiltOn();
  const btnList = [];        // hit-test records { id, cx, cy, r, enabled }
  const btnById = {};
  const pressCount = {};
  for (const id of [...ACTION_IDS, ...SHORTCUT_IDS]) { pressCount[id] = 0; }

  const ptrs = [];
  for (let i = 0; i < MAX_POINTERS; i++) {
    ptrs.push({ id: -1, kind: '', btn: null, sx: 0, sy: 0, x: 0, y: 0, t0: 0, dir: 0, longTimer: 0, picking: false, pick: '' });
  }
  const stk = { pid: -1, ox: 0, oy: 0, hx: 0, hy: 0, d: 128, travel: 54, x: 0, y: 0, edge: 0 };
  const vec = { x: 0, y: 0, mag: 0 };
  const axes = { x: 0, y: 0 };
  const knobPos = { x: 0, y: 0 };
  const origin = { x: 0, y: 0 };
  let steer = 0;
  let steerTarget = 0;
  let throttleUp = false;
  let throttleDown = false;
  let driftLatch = false;
  let accelLatch = false;
  let lookYaw = 0; let lookPitch = 0; let lookZoom = 1;
  let lookDragging = false; let lookBack2D = false;
  let pinch = null;          // { a, b, d0, z0 } pointer slots
  let equipped = SPECIALS.includes(S().special) ? S().special : 'ROAR';

  // --- Layout -------------------------------------------------------------------------------
  const probe = mk('div', 'tc-safe-probe', doc.body);
  function measureEnv() {
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const cs = win.getComputedStyle(probe);
    const safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const header = doc.querySelector('header');
    const top = header && header.getBoundingClientRect().height ? header.getBoundingClientRect().bottom + 4 : safe.t;
    // The floating message lane and fork banners: measure them laid out (shown for one
    // synchronous read, no paint), so the controls avoid exactly where they appear.
    const reveal = ['forkChoiceBanner', 'driftCounterBox'].map((id) => doc.getElementById(id)).filter((e) => e && e.classList.contains('hidden'));
    reveal.forEach((e) => e.classList.remove('hidden'));
    let x0 = Infinity; let x1 = -Infinity; let y1 = top;
    for (const id of ['announcerMain', 'coachCard', 'driftCounterBox', 'forkLeftCard', 'forkRightCard']) {
      const e = doc.getElementById(id);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
    reveal.forEach((e) => e.classList.add('hidden'));
    const lane = x1 > x0 ? { x0: x0 - 4, x1: x1 + 4, y1: y1 + 4 } : null;
    return { vw, vh, safe, top, lane, autoAccel: S().autoAccel, size: S().size };
  }

  function computeLayout(e) {
    const base = presetLayout(S().preset, e);
    return { base, items: applyCustom(base, S().layouts[layoutKey(e.vw, e.vh)], e) };
  }

  // Positioned with the individual `translate` property, so a pressed button's `scale` shrinks
  // it in place (with `transform`, the scale also applied to the translation and flung the
  // button ~10% toward the screen's top-left corner).
  function place(node, it) {
    node.style.width = `${it.d}px`;
    node.style.height = `${it.d}px`;
    node.style.translate = `${it.x - it.d / 2}px ${it.y - it.d / 2}px`;
  }

  // Landscape phones (0225): the coach tip docks in the HUD row as a slim chip, under the track
  // strip and between the place card and the next card to its right. touch.css reads these.
  function dockCoach() {
    const box = (id) => { const e = doc.getElementById(id); const r = e && e.getBoundingClientRect(); return r && r.width && r.height ? r : null; };
    const pos = box('hudPosCard'), strip = box('hudTrack'), header = doc.querySelector('header');
    if (!pos || !header || !win.matchMedia('(max-height: 479.98px)').matches) return;
    let right = win.innerWidth - 8;
    for (const id of ['hudTimes', 'hudSpeedCard', 'btnHudSettings']) {
      const r = box(id);
      if (r && r.left > pos.right) right = Math.min(right, r.left - 8);
    }
    const top = (strip ? strip.bottom : pos.top) + 2;
    const left = pos.right + 8;
    // On the banner, not :root (a root custom property restyles the whole page), and only on change.
    const st = doc.getElementById('interactiveCoachBanner')?.style;
    const set = (k, v) => { if (st && st.getPropertyValue(k) !== v) st.setProperty(k, v); };
    set('--tc-chip-l', `${Math.round(left)}px`);
    set('--tc-chip-t', `${Math.round(top)}px`);
    set('--tc-chip-w', `${Math.round(Math.max(0, right - left))}px`);
    set('--tc-chip-h', `${Math.round(Math.max(28, header.getBoundingClientRect().bottom - top))}px`);
  }

  function relayout() {
    if (!active) return;
    dockCoach(); // before measureEnv: the controls avoid the coach where it really shows
    env = measureEnv();
    movement = effectiveMovement();
    tiltWas = h.tiltOn();
    layout = computeLayout(env).items;
    side = layout.stick.x < env.vw / 2 ? 'left' : 'right';
    root.dataset.tcMovement = movement;
    layer.style.setProperty('--tc-opacity', String(S().opacity));
    btnList.length = 0;
    for (const id of [...ACTION_IDS, ...SHORTCUT_IDS]) {
      const it = layout[id];
      const b = el[id];
      const show = !!it && !it.hidden;
      b.classList.toggle('tc-hidden', !show);
      if (!show) continue;
      place(b, it);
      b.style.opacity = String(it.opacity);
      const rec = btnById[id] || (btnById[id] = { id, cx: 0, cy: 0, r: 0, enabled: true });
      rec.cx = it.x; rec.cy = it.y; rec.r = it.d / 2; rec.enabled = true;
      btnList.push(rec);
    }
    const s = layout.stick;
    stk.hx = s.x; stk.hy = s.y; stk.d = s.d; stk.travel = s.d * STICK_TRAVEL;
    place(stick, s);
    stick.style.opacity = '';
    place(dpad, { x: s.x, y: s.y, d: Math.round(s.d * 1.12) });
    place(tilt, { x: s.x, y: s.y, d: Math.max(64, Math.round(s.d * 0.62)) });
    stick.classList.toggle('tc-hidden', movement === 'dpad' || movement === 'tilt');
    dpad.classList.toggle('tc-hidden', movement !== 'dpad');
    tilt.classList.toggle('tc-hidden', movement !== 'tilt');
    stick.dataset.mode = movement;
    // The dynamic stick's hit zone is the whole lower stick-side quadrant; show its outline faintly.
    const zx = side === 'left' ? env.safe.l : env.vw / 2;
    zoneHint.style.transform = `translate3d(${zx}px, ${env.top}px, 0)`;
    zoneHint.style.width = `${env.vw / 2 - (side === 'left' ? env.safe.l : env.safe.r)}px`;
    zoneHint.style.height = `${env.vh - env.top}px`;
    resetStickVisual();
    const hint = doc.getElementById('steerHint');
    if (hint) {
      hint.style.left = `${Math.round(Math.max(env.safe.l + 8, Math.min(env.vw - 220, s.x - 90)))}px`;
      hint.style.top = `${Math.round(s.y - s.d / 2 - 44)}px`;
      hint.style.bottom = 'auto';
    }
    mirror.style.left = `${Math.round(env.vw / 2 - 150)}px`;
    mirror.style.top = `${Math.round(Math.max(env.top, (env.lane ? env.lane.y1 : env.top)) + 6)}px`;
  }

  function resetStickVisual() {
    stk.ox = stk.hx; stk.oy = stk.hy;
    stickBase.style.transform = '';
    knob.style.transform = '';
    stick.classList.remove('tc-engaged');
  }

  // --- Pointer routing ----------------------------------------------------------------------
  const slotFor = (pid) => { for (const p of ptrs) if (p.id === pid) return p; return null; };
  const freeSlot = () => { for (const p of ptrs) if (p.id === -1) return p; return null; };
  const inStickZone = (x, y) => y >= env.top && (side === 'left' ? x < env.vw / 2 : x >= env.vw / 2);
  const haptics = createHaptics({ win, doc, settings: S, calm: () => h.calm() });
  const buzz = haptics.pulse;

  function pressButton(p, id, slid = false) {
    p.btn = id;
    pressCount[id]++;
    el[id].classList.add('tc-pressed');
    buzz(id === 'boost' ? 'boost' : 'press');
    switch (id) {
      case 'boost': h.onBoost(); break;
      case 'jump': h.onJump(); break;
      case 'drift': driftLatch = true; h.onDrift(); break;
      case 'accel': accelLatch = true; break;
      // NOS: held, read in sample(). For TAP ON/OFF (0222) only a fresh touch is a tap; a thumb sliding over from DRIFT never flips it.
      case 'horn': if (!slid) InputState.nosTap = true; if (h.onNos) h.onNos(); break;
      case 'pause': h.onPause(); break;
      case 'camera': h.onCamera(); break;
      case 'respawn': h.onRespawn(); break;
      case 'special':
        p.picking = false;
        p.longTimer = win.setTimeout(() => { p.longTimer = 0; p.picking = true; openPicker(); }, LONG_PRESS_MS);
        break;
      default: break;
    }
  }

  function releaseButton(p, fire) {
    const id = p.btn;
    if (!id) return;
    p.btn = null;
    pressCount[id] = Math.max(0, pressCount[id] - 1);
    if (!pressCount[id]) el[id].classList.remove('tc-pressed');
    if (id === 'special') {
      if (p.longTimer) { win.clearTimeout(p.longTimer); p.longTimer = 0; if (fire) h.onSpecial(equipped); }
      if (p.picking) { p.picking = false; closePicker(fire ? p.pick : ''); }
    }
  }

  function openPicker() {
    const b = btnById.special;
    if (!b) return;
    const px = Math.max(env.safe.l + 108, Math.min(env.vw - env.safe.r - 108, b.cx));
    picker.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(b.cy - b.r - 8)}px, 0)`;
    picker.classList.add('tc-open');
    buzz('special');
  }
  function closePicker(choice) {
    picker.classList.remove('tc-open');
    for (const s of picker.children) s.classList.remove('tc-hot');
    if (choice) {
      equipped = choice;
      S().special = choice;
      save();
      syncSpecialIcon();
      h.onSpecial(equipped);
    }
  }
  function pickerChoiceAt(x, y) {
    for (const s of picker.children) {
      const r = s.getBoundingClientRect();
      if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return s.dataset.special;
    }
    return '';
  }
  function syncSpecialIcon() {
    el.special.querySelector('.tc-ico').innerHTML = ICONS[equipped.toLowerCase()];
    el.special.querySelector('.tc-lbl').textContent = equipped;
  }

  function stickDown(p, x, y) {
    if (stk.pid !== -1) return false;
    if (movement === 'fixed') {
      if (Math.hypot(x - stk.hx, y - stk.hy) > stk.d * 0.7) return false;
      stk.ox = stk.hx; stk.oy = stk.hy;
    } else {
      // Spawn the stick under the thumb, kept fully on screen.
      const r = stk.d / 2;
      stk.ox = Math.min(env.vw - env.safe.r - r, Math.max(env.safe.l + r, x));
      stk.oy = Math.min(env.vh - env.safe.b - r, Math.max(env.top + r, y));
    }
    stk.pid = p.id;
    p.kind = 'stick';
    stick.classList.add('tc-engaged');
    stickBase.style.transform = `translate3d(${stk.ox - stk.hx}px, ${stk.oy - stk.hy}px, 0)`;
    h.onSteerStart();
    buzz('engage');
    stickMove(x, y);
    return true;
  }

  function stickMove(x, y) {
    if (movement !== 'fixed') {
      origin.x = stk.ox; origin.y = stk.oy;
      if (followThumb(origin, x, y, stk.travel)) {
        stk.ox = origin.x; stk.oy = origin.y;
        stickBase.style.transform = `translate3d(${stk.ox - stk.hx}px, ${stk.oy - stk.hy}px, 0)`;
      }
    }
    knobPos.x = x; knobPos.y = y;
    clampToRing(knobPos, stk.ox, stk.oy, stk.travel);
    knob.style.transform = `translate3d(${knobPos.x - stk.hx}px, ${knobPos.y - stk.hy}px, 0)`;
    stickVector(x - stk.ox, y - stk.oy, stk.travel, S().deadZone, S().curve, vec);
    steerTarget = vec.x;
    throttleUp = S().stickThrottle && vec.y < -0.45;
    throttleDown = S().stickThrottle && vec.y > 0.55;
    const edge = vec.x > EDGE_STEER ? 1 : vec.x < -EDGE_STEER ? -1 : 0;
    if (edge && edge !== stk.edge) h.onSteerEdge(edge);
    stk.edge = edge;
  }

  function stickUp() {
    stk.pid = -1;
    stk.edge = 0;
    steerTarget = 0;
    throttleUp = false;
    throttleDown = false;
    resetStickVisual();
  }

  function dpadDown(p, x, y) {
    if (Math.hypot(x - stk.hx, y - stk.hy) > stk.d * 0.75) return false;
    p.kind = 'dpad';
    h.onSteerStart();
    dpadMove(p, x, y);
    return true;
  }
  function dpadMove(p, x, y) {
    const dir = dpadDirection(x - stk.hx, y - stk.hy, stk.d * 0.12);
    if (dir !== p.dir) {
      p.dir = dir;
      if (dir) buzz('tick');
      dpadAxes(dir, axes);
      if (axes.x) h.onSteerEdge(axes.x);
    }
    refreshDpad();
  }
  function refreshDpad() {
    // Multi-touch: every finger on the pad contributes (union of directions).
    let sx = 0; let up = false; let down = false; let mask = '';
    for (const q of ptrs) {
      if (q.id === -1 || q.kind !== 'dpad' || !q.dir) continue;
      dpadAxes(q.dir, axes);
      sx += axes.x;
      if (axes.y < 0) up = true;
      if (axes.y > 0) down = true;
    }
    steerTarget = Math.max(-1, Math.min(1, sx));
    throttleUp = up;
    throttleDown = down;
    if (steerTarget < 0) mask += 'w';
    if (steerTarget > 0) mask += 'e';
    if (up) mask += 'n';
    if (down) mask += 's';
    dpad.dataset.dirs = mask;
  }

  function onDown(e) {
    if (!active || editing) return;
    e.preventDefault();
    if (!h.canPlay()) return;
    const p = freeSlot();
    if (!p) return;
    p.id = e.pointerId; p.kind = ''; p.btn = null; p.dir = 0; p.pick = '';
    p.sx = p.x = e.clientX; p.sy = p.y = e.clientY; p.t0 = e.timeStamp || win.performance.now();
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const x = e.clientX; const y = e.clientY;
    const hit = hitButton(btnList, x, y, 6);
    if (hit) { p.kind = 'btn'; pressButton(p, hit.id); return; }
    if (movement === 'tilt') {
      if (Math.hypot(x - stk.hx, y - stk.hy) < stk.d * 0.5) { p.kind = 'tilt'; tilt.classList.add('tc-pressed'); h.onTiltRecenter(); return; }
    } else if (movement === 'dpad') {
      if (dpadDown(p, x, y)) return;
    } else if (inStickZone(x, y) && stickDown(p, x, y)) {
      return;
    }
    if (y >= env.top) {
      p.kind = 'look';
      const other = ptrs.find((q) => q !== p && q.id !== -1 && q.kind === 'look');
      if (other && h.is3D()) pinch = { a: other, b: p, d0: Math.max(20, Math.hypot(other.x - x, other.y - y)), z0: lookZoom };
      return;
    }
    p.kind = 'none';
  }

  function onMove(e) {
    if (!active || editing) return;
    const p = slotFor(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === 'stick') { stickMove(p.x, p.y); return; }
    if (p.kind === 'dpad') { dpadMove(p, p.x, p.y); return; }
    if (p.kind === 'btn') {
      if (p.btn === 'special' && p.picking) {
        const c = pickerChoiceAt(p.x, p.y);
        if (c !== p.pick) { p.pick = c; for (const s of picker.children) s.classList.toggle('tc-hot', s.dataset.special === c); if (c) buzz('tick'); }
        return;
      }
      const next = hitButton(btnList, p.x, p.y, 2);
      const t = slideTransition(p.btn, next, (id) => SLIDABLE.has(id));
      if (t.press) { releaseButton(p, t.release === 'special'); pressButton(p, t.press, true); }
      return;
    }
    if (p.kind === 'look') {
      const dx = p.x - p.sx; const dy = p.y - p.sy;
      if (pinch && (pinch.a === p || pinch.b === p)) {
        const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
        lookZoom = Math.max(0.6, Math.min(1.6, pinch.z0 * (pinch.d0 / Math.max(20, d))));
        return;
      }
      if (Math.hypot(dx, dy) > 24) {
        lookDragging = true;
        if (h.is3D()) {
          lookYaw = Math.max(-1, Math.min(1, dx / (env.vw * LOOK_RANGE)));
          lookPitch = Math.max(-1, Math.min(1, -dy / (env.vh * LOOK_RANGE)));
        } else if ((e.timeStamp || win.performance.now()) - p.t0 > FLICK_MS) {
          lookBack2D = true;
        }
      }
    }
  }

  function endPointer(e, cancelled) {
    const p = slotFor(e.pointerId);
    if (!p) return;
    if (e.cancelable) e.preventDefault();
    if (p.kind === 'stick') stickUp();
    else if (p.kind === 'btn') releaseButton(p, !cancelled);
    else if (p.kind === 'dpad') { p.dir = 0; p.kind = ''; refreshDpad(); }
    else if (p.kind === 'tilt') tilt.classList.remove('tc-pressed');
    else if (p.kind === 'look') {
      const dt = (e.timeStamp || win.performance.now()) - p.t0;
      const dx = p.x - p.sx; const dy = p.y - p.sy;
      if (!cancelled && !lookBack2D && !pinch && dt < FLICK_MS && Math.hypot(dx, dy) > FLICK_PX) {
        h.onFlick(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down'));
      }
      if (pinch && (pinch.a === p || pinch.b === p)) pinch = null;
      if (!ptrs.some((q) => q !== p && q.id !== -1 && q.kind === 'look')) { lookDragging = false; lookBack2D = false; }
    }
    p.id = -1; p.kind = ''; p.btn = null;
    if (headerMoved && !held()) headerResized();
  }

  /** Lift every finger: lost focus, a modal opened, the race ended. Nothing stays stuck on. */
  function releaseAll() {
    for (const p of ptrs) {
      if (p.id === -1) continue;
      if (p.kind === 'btn') releaseButton(p, false);
      p.id = -1; p.kind = ''; p.btn = null; p.dir = 0;
    }
    stickUp();
    refreshDpad();
    pinch = null; lookDragging = false; lookBack2D = false;
    tilt.classList.remove('tc-pressed');
    picker.classList.remove('tc-open');
    driftLatch = false; accelLatch = false;
    if (headerMoved) headerResized(); // the HUD moved while a finger was down: catch up now
  }

  layer.addEventListener('pointerdown', onDown, { passive: false });
  layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', (e) => endPointer(e, false), { passive: false });
  layer.addEventListener('pointercancel', (e) => endPointer(e, true), { passive: false });
  layer.addEventListener('lostpointercapture', (e) => { if (slotFor(e.pointerId)) endPointer(e, true); });
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS: no pinch-zoom, double-tap zoom, rubber-band scroll or edge-swipe while racing.
  const guard = (e) => { if (active && !editing && (e.touches ? e.touches.length : 1) && layer.contains(e.target)) e.preventDefault(); };
  layer.addEventListener('touchstart', guard, { passive: false });
  layer.addEventListener('touchmove', guard, { passive: false });
  doc.addEventListener('gesturestart', (e) => { if (active) e.preventDefault(); });
  doc.addEventListener('dblclick', (e) => { if (active && layer.contains(e.target)) e.preventDefault(); });
  // Leaving the app hides the page; system gestures and dialogs cancel the pointers themselves.
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseAll(); });
  win.addEventListener('pagehide', releaseAll);

  let queued = false;
  const schedule = () => { if (!queued) { queued = true; win.requestAnimationFrame(() => { queued = false; releaseAll(); relayout(); }); } };
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  // The HUD changes height mid-race (a phone's speed card wraps once the score grows), so a
  // header resize never lifts a held finger: the controls catch up when the last one comes off.
  let headerMoved = false; let headerQueued = false;
  const held = () => { for (const p of ptrs) if (p.id !== -1) return true; return false; };
  const headerResized = () => {
    headerMoved = true;
    if (headerQueued || held()) return;
    headerQueued = true;
    win.requestAnimationFrame(() => { headerQueued = false; if (!held()) { headerMoved = false; relayout(); } });
  };
  if (typeof win.ResizeObserver === 'function') {
    const header = doc.querySelector('header');
    if (header) new win.ResizeObserver(headerResized).observe(header);
    // The cards around the docked coach change width within the header (the clock, speed and score
    // grow; the strip's 1fr column takes up every change): re-dock only.
    const dock = new win.ResizeObserver(() => { if (active) dockCoach(); });
    for (const id of ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard']) { const e = doc.getElementById(id); if (e) dock.observe(e); }
  }

  // --- Per-frame ----------------------------------------------------------------------------
  /** Fold touch state into InputState. Call once per frame before the sim reads input. */
  function sample(dt) {
    if (!active) {
      InputState.touchSteerVal = 0; InputState.touchUp = false; InputState.touchDown = false;
      InputState.lookBack = false;
      InputState.touchNos = false;
      return;
    }
    const digital = movement === 'dpad';
    const target = Math.max(-1.25, Math.min(1.25, steerTarget * S().sensitivity));
    steer = smoothSteer(steer, target, dt, digital ? 5.5 : 10, digital ? 9 : 18);
    InputState.touchSteerVal = steer;
    InputState.touchUp = pressCount.accel > 0 || accelLatch || throttleUp;
    InputState.touchDown = pressCount.drift > 0 || driftLatch || throttleDown;
    driftLatch = false; accelLatch = false;
    InputState.lookBack = pressCount.rear > 0 || lookBack2D;
    InputState.touchNos = pressCount.horn > 0;
    if (!lookDragging) {
      const k = Math.min(1, dt * 7);
      lookYaw -= lookYaw * k; lookPitch -= lookPitch * k;
      if (Math.abs(lookYaw) < 0.002) lookYaw = 0;
      if (Math.abs(lookPitch) < 0.002) lookPitch = 0;
    }
    InputState.lookYaw = lookYaw;
    InputState.lookPitch = lookPitch;
    InputState.lookZoom = lookZoom;
  }

  /** Cooldown rings, ready glows and the rear-view mirror. Writes only when a value changes. */
  function render() {
    if (!active) return;
    if (h.tiltOn() !== tiltWas) relayout();
    const st = h.status();
    if (st) {
      setRing('boost', st.flux);
      if (!!st.warpReady !== boostReady) setBoostReady(!!st.warpReady);
      if (!!st.calm !== boostCalm) { boostCalm = !!st.calm; el.boost.classList.toggle('tc-calm', boostCalm); }
      setRing('respawn', st.respawn);
      setRing('special', st.specials > 0 ? 1 : st.flux >= 0.35 ? 1 : 0);
      const n = String(st.specials);
      if (specialBadge.textContent !== n) specialBadge.textContent = n;
      el.jump.classList.toggle('tc-dim', !!st.airborne);
      if (!!st.nosOn !== nosOn) setNosOn(!!st.nosOn);
    }
    const showMirror = InputState.lookBack && !h.is3D();
    if (mirror.classList.contains('tc-open') !== showMirror) mirror.classList.toggle('tc-open', showMirror);
    if (showMirror) h.drawMirror(mirrorCtx, mirror.width, mirror.height);
  }
  // WARP READY (0112): the label and the border's shape (a double ring) change too, not just the colour, so the cue
  // survives colour-blindness and a greyscale screen; calm motion keeps them but stops the pulse.
  let boostReady = false, boostCalm = false;
  const boostLbl = el.boost.querySelector('.tc-lbl');
  function setBoostReady(on) {
    boostReady = on;
    el.boost.classList.toggle('tc-ready', on);
    el.boost.dataset.ready = on ? 'true' : 'false';
    boostLbl.textContent = on ? 'READY' : LABELS.boost;
    el.boost.setAttribute('aria-label', on ? `${LABELS.boost} ready` : LABELS.boost);
  }
  // NOS TAP ON/OFF (0222): a tapped-on burn says so in text on the button, not only in colour.
  let nosOn = false;
  const nosLbl = el.horn.querySelector('.tc-lbl');
  function setNosOn(on) {
    nosOn = on;
    el.horn.classList.toggle('tc-on', on);
    el.horn.dataset.on = on ? 'true' : 'false';
    nosLbl.textContent = on ? 'NOS ON' : LABELS.horn;
    el.horn.setAttribute('aria-label', on ? `${LABELS.horn} on` : LABELS.horn);
  }
  function setRing(id, v) {
    const r = ring[id];
    if (!r) return;
    const q = Math.round(Math.max(0, Math.min(1, v || 0)) * 50);
    if (q === r.last) return;
    r.last = q;
    r.fill.style.strokeDashoffset = String(100 - q * 2);
    if (id === 'respawn') el.respawn.classList.toggle('tc-cool', q < 50);
  }

  // --- Visibility ---------------------------------------------------------------------------
  function setActive(on) {
    if (on === active) return;
    active = on;
    root.classList.toggle('touch-ui', on);
    if (!on) {
      releaseAll();
      const hint = doc.getElementById('steerHint');
      if (hint) { hint.style.left = ''; hint.style.top = ''; hint.style.bottom = ''; }
    }
    else relayout();
  }

  return {
    sample, render, relayout, releaseAll, setActive,
    isActive: () => active,
    setEditing(on) { editing = on; if (on) releaseAll(); layer.classList.toggle('tc-editing', on); },
    applySettings() { movement = effectiveMovement(); equipped = SPECIALS.includes(S().special) ? S().special : equipped; syncSpecialIcon(); relayout(); },
    layoutNow: () => ({ env, items: layout }),
    computeLayout, measureEnv, place, elements: el, stickEl: stick, dpadEl: dpad, tiltEl: tilt, layer,
    get equipped() { return equipped; },
    haptics,
  };
}
