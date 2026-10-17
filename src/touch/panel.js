// Controls settings panel and the first-run thumb guide (ticket 0061). Built on demand; the
// panel edits SaveStore.data.controls in place and calls onChange so the race picks it up.
import { PRESETS, PRESET_IDS, presetLayout, MOVEMENT_MODES } from './layouts.js';
import { movementFor, CONTROL_DEFAULTS } from './settings.js';
import { openLayoutEditor } from './editor.js';

export { openLayoutEditor };
import { ICONS } from './icons.js';

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
  { key: 'haptics', label: 'Haptics', hint: 'Feel every press, boost and crash (vibration on Android, taps on iPhone with iOS 18+).' },
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

/** First race on a touch screen: where each thumb goes. Shown once; replay from the panel. */
export function maybeShowCoach(ctx) {
  if (ctx.settings.coachSeen) return false;
  showCoach(ctx);
  return true;
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
