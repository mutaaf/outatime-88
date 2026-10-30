// Controls settings panel and the first-run thumb guide (ticket 0061). Built on demand; the
// panel edits SaveStore.data.controls in place and calls onChange so the race picks it up.
import { PRESETS, PRESET_IDS, presetLayout, MOVEMENT_MODES } from './layouts.js';
import { movementFor, CONTROL_DEFAULTS } from './settings.js';
import { openLayoutEditor } from './editor.js';

export { openLayoutEditor };
import { ICONS } from './icons.js';
import { SaveStore } from '../save.js';
import { placeTips } from './guide-tips.js';

const MOVEMENT_INFO = {
  dynamic: { name: 'Thumbstick', tag: 'Roblox', hint: 'Appears wherever your thumb lands.' },
  floating: { name: 'Floating stick', tag: 'Fortnite', hint: 'Always visible; jumps to your thumb.' },
  fixed: { name: 'Fixed stick', tag: '', hint: 'Stays put. Drag the knob.' },
  dpad: { name: 'D-pad', tag: '', hint: 'Arrows. Slide between them.' },
  tilt: { name: 'Tilt', tag: '', hint: 'Steer by tilting the device.' },
};

const SLIDERS = [
  { key: 'sensitivity', label: 'Steering sensitivity', min: 0.5, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'deadZone', label: 'Stick dead zone', min: 0.04, max: 0.3, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'curve', label: 'Response', min: 1, max: 2.5, step: 0.1, fmt: (v) => (v < 1.3 ? 'Direct' : v < 1.9 ? 'Smooth' : 'Precise') },
  { key: 'size', label: 'Button size', min: 0.8, max: 1.3, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'hapticStrength', label: 'Haptic strength', min: 0.3, max: 1, step: 0.05, fmt: (v) => (v < 0.45 ? 'Light' : v < 0.8 ? 'Medium' : 'Strong') },
  { key: 'opacity', label: 'Button opacity', min: 0.3, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

const TOGGLES = [
  { key: 'autoAccel', label: 'Auto-accelerate', hint: 'The car drives itself forward.' },
  { key: 'stickThrottle', label: 'Stick up/down = gas/brake', hint: 'Push up to speed up, down to brake.' },
  { key: 'steerAssist', label: 'Steer assist', hint: 'Keeps you in lane when you let go.' },
  { key: 'haptics', label: 'Haptics', hint: 'Feel every press, boost and crash (vibration on Android, taps on iPhone with iOS 18+), and the tyres and walls through a gamepad.' },
  { key: 'fullscreen', label: 'Fullscreen races', hint: 'Phones hide the browser bars when a race starts (Android). Add to Home Screen does it everywhere.' },
];

function h(tag, attrs, html) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** A tiny picture of a preset on this screen: the real layout, scaled down. */
function presetPreview(id, env, autoAccel) {
  const L = presetLayout(id, Object.assign({}, env, { autoAccel }));
  const scale = 120 / env.vw;
  const H = Math.round(env.vh * scale);
  const dots = Object.entries(L).filter(([, it]) => !it.hidden).map(([k, it]) => {
    const c = k === 'stick' ? '#00f0ff' : k === 'boost' ? '#fde047' : ['pause', 'rear', 'camera', 'respawn'].includes(k) ? '#64748b' : '#e879f9';
    return `<circle cx="${(it.x * scale).toFixed(1)}" cy="${(it.y * scale).toFixed(1)}" r="${(it.d * scale / 2).toFixed(1)}" fill="${c}" fill-opacity="${k === 'stick' ? 0.35 : 0.8}"/>`;
  }).join('');
  return `<svg viewBox="0 0 120 ${H}" width="120" height="${H}" aria-hidden="true"><rect width="120" height="${H}" rx="6" fill="#0b1020" stroke="#334155"/><rect width="120" height="${(env.top * scale).toFixed(1)}" fill="#1e293b"/>${dots}</svg>`;
}

export function openControlsPanel(ctx) {
  const { settings, save, controls, onChange, enableTilt, tiltState } = ctx;
  closeControlsPanel();
  const wasActive = controls.isActive();
  if (!wasActive) controls.setActive(true);
  const env = controls.measureEnv();
  const panel = h('div', { id: 'tcPanel', class: 'tc-panel', role: 'dialog', 'aria-label': 'Controls' });
  const card = h('div', { class: 'tc-panel-card' });
  panel.appendChild(card);
  card.innerHTML = `
    <div class="tc-panel-head"><h2>🎮 CONTROLS</h2><button type="button" class="tc-chip" data-act="done">DONE ✓</button></div>
    <section><h3>STEERING</h3><div class="tc-seg" id="tcMoveSeg"></div><p class="tc-note" id="tcMoveNote"></p></section>
    <section><h3>BUTTON LAYOUT</h3><div class="tc-presets" id="tcPresetGrid"></div>
      <button type="button" class="tc-big" id="btnEditHudLayout" data-act="edit">✏️ EDIT HUD LAYOUT</button></section>
    <section><h3>FEEL</h3><div id="tcToggles"></div><div id="tcSliders"></div></section>
    <section class="tc-row"><button type="button" class="tc-chip" data-act="coach">👍 SHOW THUMB GUIDE</button><button type="button" class="tc-chip" data-act="reset">↺ RESET CONTROLS</button></section>`;

  const seg = card.querySelector('#tcMoveSeg');
  const note = card.querySelector('#tcMoveNote');
  const grid = card.querySelector('#tcPresetGrid');
  const toggles = card.querySelector('#tcToggles');
  const sliders = card.querySelector('#tcSliders');

  const commit = () => { save(); onChange(); };

  function renderMovement() {
    const cur = movementFor(settings);
    seg.innerHTML = MOVEMENT_MODES.map((m) => {
      const i = MOVEMENT_INFO[m];
      return `<button type="button" data-move="${m}" aria-pressed="${m === cur}" class="${m === cur ? 'on' : ''}">
        <b>${i.name}</b>${i.tag ? `<small>${i.tag}</small>` : ''}</button>`;
    }).join('');
    note.textContent = MOVEMENT_INFO[cur].hint + (cur === 'tilt' ? (tiltState() ? ' Tilt is ON.' : ' Tap Tilt again if your device asked for permission.') : '');
  }
  function renderPresets() {
    grid.innerHTML = PRESET_IDS.map((id) => `<button type="button" data-preset="${id}" aria-pressed="${id === settings.preset}" class="${id === settings.preset ? 'on' : ''}">
      ${presetPreview(id, env, settings.autoAccel)}<b>${PRESETS[id].name}</b><small>${PRESETS[id].blurb}</small></button>`).join('');
  }
  function renderFeel() {
    toggles.innerHTML = TOGGLES.map((t) => `<label class="tc-toggle"><input type="checkbox" data-toggle="${t.key}" ${settings[t.key] ? 'checked' : ''}/>
      <span><b>${t.label}</b><small>${t.hint}</small></span></label>`).join('');
    sliders.innerHTML = SLIDERS.map((s) => `<label class="tc-slider"><span><b>${s.label}</b><output>${s.fmt(settings[s.key])}</output></span>
      <input type="range" data-slider="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${settings[s.key]}"/></label>`).join('');
  }
  renderMovement(); renderPresets(); renderFeel();

  card.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.move) {
      const m = t.dataset.move;
      settings.movement = m === PRESETS[settings.preset].movement ? '' : m;
      // iOS asks for motion permission only inside a tap, so tilt is requested right here.
      if (m === 'tilt') Promise.resolve(enableTilt(true)).then(() => { if (!tiltState()) { settings.movement = ''; } renderMovement(); commit(); });
      else if (tiltState()) enableTilt(false);
      renderMovement(); commit();
    } else if (t.dataset.preset) {
      settings.preset = t.dataset.preset;
      settings.movement = '';
      if (tiltState()) enableTilt(false);
      renderPresets(); renderMovement(); commit();
    } else if (t.dataset.act === 'done') {
      closeControlsPanel();
      if (!wasActive && !ctx.keepActive) controls.setActive(false);
      if (ctx.onDone) ctx.onDone();
    } else if (t.dataset.act === 'edit') {
      closeControlsPanel();
      openLayoutEditor({ settings, save, controls, onClose: () => { onChange(); openControlsPanel(ctx); } });
    } else if (t.dataset.act === 'coach') {
      settings.coachSeen = false;
      closeControlsPanel();
      showCoach({ settings, save, controls, pause() {}, resume() {} });
    } else if (t.dataset.act === 'reset') {
      const keep = settings.coachSeen;
      Object.assign(settings, JSON.parse(JSON.stringify(CONTROL_DEFAULTS)), { coachSeen: keep });
      if (tiltState()) enableTilt(false);
      renderMovement(); renderPresets(); renderFeel(); commit();
    }
  });
  card.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      settings[t.dataset.toggle] = t.checked;
      if (t.dataset.toggle === 'autoAccel') renderPresets();
      if (t.dataset.toggle === 'haptics' && t.checked && controls.haptics) controls.haptics.pulse('boost'); // feel it at once
      commit();
    }
    // Let go of the strength slider: a sample pulse at the new strength.
    if (t.dataset.slider === 'hapticStrength' && controls.haptics) controls.haptics.pulse('boost');
  });
  card.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.slider) return;
    const s = SLIDERS.find((x) => x.key === t.dataset.slider);
    settings[s.key] = Number(t.value);
    t.previousElementSibling.querySelector('output').textContent = s.fmt(settings[s.key]);
    commit();
  });
  panel.addEventListener('click', (e) => { if (e.target === panel) card.querySelector('[data-act="done"]').click(); });
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') card.querySelector('[data-act="done"]').click(); });
  document.body.appendChild(panel);
  card.querySelector('[data-act="done"]').focus();
  return panel;
}

export function closeControlsPanel() {
  const old = document.getElementById('tcPanel');
  if (old) old.remove();
}

/** Landscape phones (0225): the thumb guide's bubbles take turns, this long each. */
export const GUIDE_TURN_MS = 2400;
const ONE_AT_A_TIME = '(max-height: 479.98px)';

/** First race on a touch screen: where each thumb goes. Shown once; replay from the panel. */
export function maybeShowCoach(ctx) {
  if (ctx.settings.coachSeen) return false;
  showThumbGuide(ctx);
  return true;
}

/**
 * The first-race thumb guide, played over the start lights instead of stopping the race: a
 * ghost thumb swipes the steering zone, WARP and NOS pulse with a two-word label each, and it
 * all fades out once you steer or a few seconds after GO. Nothing to read, nothing to tap
 * (pointer-events: none), so the race and the countdown carry on underneath.
 * ctx: { settings, save, controls, done() → true when the guide has done its job }
 */
export function showThumbGuide({ settings, save, controls, done }) {
  const { env, items } = controls.layoutNow();
  if (!env || !items || !items.stick) return;
  const old = document.getElementById('tcGuide');
  if (old) old.remove();
  const mv = movementFor(settings);
  const s = items.stick, b = items.boost, n = items.horn;
  const swipe = mv === 'dynamic' || mv === 'floating' || mv === 'fixed';
  const stickLabel = mv === 'dpad' ? 'TAP ◀ ▶ TO STEER' : mv === 'tilt' ? 'TILT TO STEER' : 'DRAG TO STEER';
  const g = h('div', { id: 'tcGuide', class: 'tc-guide', 'aria-hidden': 'true' });
  const ring = (it, cls, k) => `<div class="tc-guide-ring ${cls}" data-k="${k}" style="left:${it.x}px;top:${it.y}px;width:${it.d + 18}px;height:${it.d + 18}px"></div>`;
  // The bubbles go beside their pads, never on one and never off the screen (0166); see placeTips.
  // The steering control as drawn: the D-pad and the tilt badge are sized off the stick's slot.
  const sd = mv === 'dpad' ? Math.round(s.d * 1.12) : mv === 'tilt' ? Math.max(64, Math.round(s.d * 0.62)) : s.d;
  const steer = { x: s.x, y: s.y, d: sd };
  const tips = [[steer, stickLabel, 'tc-guide-tip-steer', 'steer']];
  if (b && !b.hidden) tips.push([b, 'WARP', 'tc-guide-tip-warp', 'warp']);
  if (n && !n.hidden) tips.push([n, SaveStore.data.settings?.nos === 'toggle' ? 'TAP = NOS ON/OFF' : 'HOLD = NOS', 'tc-guide-tip-nos', 'nos']); // 0222
  g.innerHTML = `
    <div class="tc-guide-thumb${swipe ? ' tc-guide-swipe' : ''}" style="left:${s.x}px;top:${s.y}px">${ICONS.recenter}</div>
    ${b && !b.hidden ? ring(b, 'tc-guide-warp', 'warp') : ''}
    ${n && !n.hidden ? ring(n, 'tc-guide-nos', 'nos') : ''}
    ${tips.map(([, text, cls, k]) => `<i class="tc-guide-tip ${cls}" data-k="${k}">${text}</i>`).join('')}`;
  document.body.appendChild(g);
  // The guide's steer bubble says what the first-race steer hint says: one of them at a time.
  document.body.classList.add('tc-guiding');
  const els = g.querySelectorAll('.tc-guide-tip');
  const pads = Object.values(items).filter((it) => it && !it.hidden && it !== s)
    .map((it) => ({ x: it.x, y: it.y, d: it.d, ring: (it === b || it === n) }));
  pads.push(steer);
  const view = { l: env.safe.l, t: env.top, r: env.vw - env.safe.r, b: env.vh - env.safe.b };
  // Placed on the font the bubbles will show in: Orbitron is wider than the fallback.
  const place = () => {
    if (!g.isConnected) return;
    // The layout moved on (a rotation) before the font landed: these spots are stale, so no bubbles.
    const stale = controls.layoutNow().items !== items;
    const size = (el) => el.getBoundingClientRect();
    const spots = stale ? tips.map(() => null)
      : placeTips(tips.map(([it], i) => ({ x: it.x, y: it.y, d: it.d, w: Math.ceil(size(els[i]).width), h: Math.ceil(size(els[i]).height) })), pads, view);
    for (const old of g.querySelectorAll('.tc-guide-lead')) old.remove();
    spots.forEach((at, i) => {
      const el = els[i];
      el.style.visibility = at ? 'visible' : 'hidden';
      if (!at) return;
      el.style.left = `${at.x}px`;
      el.style.top = `${at.y}px`;
      if (!at.lead) return;
      const { x1, y1, x2, y2 } = at.lead;
      const line = h('div', { class: `tc-guide-lead ${tips[i][2]}`, 'data-k': tips[i][3] });
      line.style.cssText = `left:${x1}px;top:${y1}px;width:${Math.hypot(x2 - x1, y2 - y1)}px;transform:rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      g.insertBefore(line, g.firstChild);
    });
  };
  // Landscape phones (0225): one bubble at a time, in turn (steer, NOS, WARP), with its lead and
  // ring; touch.css also hides them while the coach tip shows, and the guide's clock holds then.
  const order = ['steer', 'nos', 'warp'].filter((k) => tips.some((t) => t[3] === k));
  const oneAtATime = () => window.matchMedia(ONE_AT_A_TIME).matches;
  const turn = (age) => {
    const now = oneAtATime() ? order[Math.floor(age / GUIDE_TURN_MS) % order.length] : null;
    for (const el of g.querySelectorAll('[data-k]')) el.classList.toggle('tc-guide-off', !!now && el.dataset.k !== now);
  };
  let t0 = performance.now();
  place();
  turn(0);
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { place(); turn(performance.now() - t0); });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    settings.coachSeen = true;
    save();
    g.classList.add('tc-guide-out');
    setTimeout(() => {
      g.remove();
      if (!document.getElementById('tcGuide')) document.body.classList.remove('tc-guiding');
    }, 400);
  };
  const tick = () => {
    if (closing || !g.isConnected) return;
    // Held while the phone start grid has the screen (0215): its time and your steering don't count.
    const one = oneAtATime();
    if (document.body.classList.contains('rc-grid-up') || (one && document.body.classList.contains('coach-up'))) { t0 += 150; setTimeout(tick, 150); return; }
    const age = performance.now() - t0;
    turn(age);
    // One at a time, every bubble gets its turn before steering can end the guide.
    const told = !one || age >= GUIDE_TURN_MS * order.length;
    if ((age > 1500 && told && done && done()) || age > 14000) close();
    else setTimeout(tick, 150);
  };
  setTimeout(tick, 150);
}

export function showCoach({ settings, save, controls, pause, resume }) {
  const { env, items } = controls.layoutNow();
  if (!env || !items || !items.stick) return;
  const old = document.getElementById('tcCoach');
  if (old) old.remove();
  pause();
  const mv = movementFor(settings);
  const s = items.stick;
  const left = s.x < env.vw / 2;
  const b = items.boost;
  const stickText = mv === 'dpad' ? 'Press the arrows to steer. Slide between them.'
    : mv === 'tilt' ? 'Tilt to steer. Tap here to re-centre.'
      : mv === 'fixed' ? 'Drag the stick to steer.'
        : 'Put your thumb anywhere here and drag to steer.';
  const zoneX = left ? env.safe.l : env.vw / 2;
  const zoneW = env.vw / 2 - (left ? env.safe.l : env.safe.r);
  const coach = h('div', { id: 'tcCoach', class: 'tc-coach', role: 'dialog', 'aria-label': 'How to hold the controls' });
  const card = (x, y, title, text, align) => `<div class="tc-coach-card" style="left:${Math.round(x)}px;top:${Math.round(y)}px;transform:translate(${align}, -100%)"><b>${title}</b><span>${text}</span></div>`;
  const stickZone = mv === 'dynamic' || mv === 'floating'
    ? `<div class="tc-coach-zone" style="left:${zoneX}px;top:${env.top}px;width:${zoneW}px;height:${env.vh - env.top}px"></div>` : '';
  const cardY = Math.max(env.top + 90, Math.min(s.y - s.d / 2, b.y - b.d) - 12);
  coach.innerHTML = `${stickZone}
    <div class="tc-coach-thumb" style="left:${s.x}px;top:${s.y}px">${ICONS.recenter}</div>
    <div class="tc-coach-thumb tc-coach-thumb-b" style="left:${b.x}px;top:${b.y}px">${ICONS.boost}</div>
    ${card(left ? env.safe.l + 16 : env.vw - env.safe.r - 16, cardY, left ? '◀ LEFT THUMB' : 'RIGHT THUMB ▶', stickText, left ? '0' : '-100%')}
    ${card(left ? env.vw - env.safe.r - 16 : env.safe.l + 16, cardY, left ? 'RIGHT THUMB ▶' : '◀ LEFT THUMB', 'WARP when it glows. DRIFT, JUMP and ★ SPECIAL around it. Hold ★ to switch special.', left ? '-100%' : '0')}
    <button type="button" class="tc-coach-go" id="btnCoachGo">GOT IT — RACE! 🏁</button>`;
  const done = () => {
    settings.coachSeen = true;
    save();
    coach.remove();
    resume();
  };
  coach.querySelector('#btnCoachGo').addEventListener('click', done);
  document.body.appendChild(coach);
}
