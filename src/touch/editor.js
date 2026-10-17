// HUD layout editor (ticket 0061), like Fortnite's "Edit HUD Layout": drag any control, resize
// it, fade it, hide the optional ones, snap to a grid, reset. Edits are saved per device class
// and orientation (SaveStore.data.controls.layouts['phone-portrait'] …), so a phone held either
// way and a tablet each keep their own. A control can never be dropped on the HUD, off screen
// or on another control: it snaps back to where it was.
import { PRESETS, PRESET_IDS, layoutKey, toCustomItem, layoutProblems, MIN_TARGET } from './layouts.js';
import { LABELS } from './icons.js';

const OPTIONAL = new Set(['horn', 'rear', 'camera', 'respawn', 'special', 'jump']);
const GRID = 8;

export function openLayoutEditor({ settings, save, controls, onClose }) {
  const wasActive = controls.isActive();
  if (!wasActive) controls.setActive(true);
  controls.relayout();
  controls.setEditing(true);
  const { env } = controls.layoutNow();
  const key = layoutKey(env.vw, env.vh);
  let { base, items } = controls.computeLayout(env);
  items = clone(items);
  let selected = '';
  let snap = true;
  const nodes = Object.assign({ stick: controls.stickEl }, controls.elements);
  const movement = document.documentElement.dataset.tcMovement;
  const stickNode = () => (movement === 'dpad' ? controls.dpadEl : movement === 'tilt' ? controls.tiltEl : controls.stickEl);
  nodes.stick = stickNode();

  const bar = document.createElement('div');
  bar.id = 'tcEditBar';
  bar.className = 'tc-editbar';
  bar.innerHTML = `
    <div class="tc-editbar-row">
      <b>EDIT HUD LAYOUT</b><small>${key.replace('-', ' · ').toUpperCase()}</small>
      <select id="tcEditPreset" aria-label="Start from preset">${PRESET_IDS.map((id) => `<option value="${id}" ${id === settings.preset ? 'selected' : ''}>${PRESETS[id].name}</option>`).join('')}</select>
      <button type="button" data-act="snap" aria-pressed="true">▦ SNAP</button>
      <button type="button" data-act="reset">↺ RESET</button>
      <button type="button" data-act="done" class="tc-edit-done">SAVE ✓</button>
    </div>
    <div class="tc-editbar-row tc-edit-sel" id="tcEditSel" hidden>
      <b id="tcEditName"></b>
      <label>SIZE <input type="range" id="tcEditSize" min="0.6" max="1.6" step="0.05"/></label>
      <label>OPACITY <input type="range" id="tcEditOpacity" min="0.2" max="1" step="0.05"/></label>
      <button type="button" data-act="hide" id="tcEditHide">HIDE</button>
    </div>
    <p class="tc-edit-tip">Drag a control to move it. Tap one to resize it.</p>`;
  document.body.appendChild(bar);
  const sel = bar.querySelector('#tcEditSel');
  const sizeIn = bar.querySelector('#tcEditSize');
  const opIn = bar.querySelector('#tcEditOpacity');
  const hideBtn = bar.querySelector('#tcEditHide');

  // The bar sits in the HUD band, which controls can't use anyway.
  function paint() {
    for (const [id, node] of Object.entries(nodes)) {
      const it = items[id];
      if (!it || !node) continue;
      const shown = !it.hidden || OPTIONAL.has(id);
      node.classList.toggle('tc-hidden', !shown);
      if (!shown) continue;
      const d = id === 'stick' && movement === 'dpad' ? Math.round(it.d * 1.12) : id === 'stick' && movement === 'tilt' ? Math.max(64, Math.round(it.d * 0.62)) : it.d;
      controls.place(node, { x: it.x, y: it.y, d });
      node.style.opacity = it.hidden ? '0.25' : String(it.opacity);
      node.classList.toggle('tc-selected', id === selected);
    }
  }
  function select(id) {
    selected = id;
    sel.hidden = !id;
    if (id) {
      const it = items[id];
      bar.querySelector('#tcEditName').textContent = id === 'stick' ? 'STEERING' : LABELS[id];
      sizeIn.value = String(it.d / base[id].d);
      opIn.value = String(it.opacity);
      hideBtn.hidden = !OPTIONAL.has(id);
      hideBtn.textContent = it.hidden ? 'SHOW' : 'HIDE';
    }
    paint();
  }
  const valid = (id) => !layoutProblems(items, env).some((p) => p.startsWith(`${id} `) || p.endsWith(` ${id}`));

  let drag = null;
  const idAt = (target) => {
    for (const [id, node] of Object.entries(nodes)) if (node && (node === target || node.contains(target))) return id;
    return '';
  };
  const onDown = (e) => {
    const id = idAt(e.target);
    if (!id) { select(''); return; }
    e.preventDefault();
    try { controls.layer.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    drag = { pid: e.pointerId, id, sx: e.clientX, sy: e.clientY, ox: items[id].x, oy: items[id].y, moved: false };
    select(id);
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    const it = items[drag.id];
    let x = drag.ox + e.clientX - drag.sx;
    let y = drag.oy + e.clientY - drag.sy;
    if (snap) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
    const r = it.d / 2;
    it.x = Math.max(env.safe.l + r, Math.min(env.vw - env.safe.r - r, x));
    it.y = Math.max(env.top + r, Math.min(env.vh - env.safe.b - r, y));
    drag.moved = true;
    nodes[drag.id].classList.toggle('tc-bad', !valid(drag.id));
    paint();
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (e.type === 'pointerup' && (e.clientX || e.clientY)) onMove(e); // the lift point is the drop point
    const id = drag.id;
    if (!valid(id)) { items[id].x = drag.ox; items[id].y = drag.oy; }
    nodes[id].classList.remove('tc-bad');
    drag = null;
    paint();
  };
  const layer = controls.layer;
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);

  const resize = (scale) => {
    const it = items[selected];
    const prev = it.d;
    it.d = Math.max(MIN_TARGET, Math.round(base[selected].d * scale));
    const r = it.d / 2;
    it.x = Math.max(env.safe.l + r, Math.min(env.vw - env.safe.r - r, it.x));
    it.y = Math.max(env.top + r, Math.min(env.vh - env.safe.b - r, it.y));
    if (!valid(selected)) { it.d = prev; sizeIn.value = String(prev / base[selected].d); }
    paint();
  };
  sizeIn.addEventListener('input', () => resize(Number(sizeIn.value)));
  opIn.addEventListener('input', () => { items[selected].opacity = Number(opIn.value); paint(); });
  bar.querySelector('#tcEditPreset').addEventListener('change', (e) => {
    settings.preset = e.target.value;
    settings.movement = '';
    delete settings.layouts[key];
    ({ base, items } = controls.computeLayout(env));
    items = clone(items);
    select('');
  });
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'snap') { snap = !snap; t.setAttribute('aria-pressed', String(snap)); }
    else if (act === 'hide' && selected) {
      items[selected].hidden = !items[selected].hidden;
      if (!items[selected].hidden && !valid(selected)) items[selected].hidden = true;
      select(selected);
    } else if (act === 'reset') {
      delete settings.layouts[key];
      ({ base, items } = controls.computeLayout(env));
      items = clone(items);
      select('');
    } else if (act === 'done') {
      const custom = {};
      for (const id of Object.keys(items)) custom[id] = toCustomItem(base[id], items[id], env);
      settings.layouts[key] = { items: custom };
      save();
      close();
    }
  });

  function close() {
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    layer.removeEventListener('pointercancel', onUp);
    for (const node of Object.values(nodes)) if (node) node.classList.remove('tc-selected', 'tc-bad');
    bar.remove();
    controls.setEditing(false);
    controls.relayout();
    if (!wasActive) controls.setActive(false);
    if (onClose) onClose();
  }
  select('');
  return { close };
}

function clone(items) {
  const out = {};
  for (const [k, v] of Object.entries(items)) out[k] = Object.assign({}, v);
  return out;
}
