// Pause controls reference (ticket 0204): one compact card of the six driving controls for the
// input in hand — keys (rebound ones included, 0013), pad buttons, touch pads or the TV phone
// controller. Lazy: the settings panel and the garage import it, the two sheets a race pauses
// behind. controlsKind/controlRows are pure; renderControlsRef writes a card.
import { GameState } from './state.js';
import { InputState } from './input.js';
import { SaveStore } from './save.js';
import { ACTIONS, normalizeKeys, keyName } from './keybinds.js';
import { movementFor } from './touch/settings.js';

const TITLES = { keys: 'KEYBOARD', pad: 'GAMEPAD', touch: 'TOUCH', phone: 'PHONE PAD' };
const LABELS = ['STEER', 'GAS', 'BRAKE', 'WARP', 'NOS', 'JUMP'];
const PAD = ['L-STICK · D-PAD', 'A · RT', 'B · LT', 'X · RB', 'LB', 'Y'];
const PHONE = ['TILT', 'GAS', 'BRAKE', 'BOOST', 'NOS', 'JUMP'];

/** Which controls to show: InputState.lastInput, or before any input a guess from the pointer. */
export function controlsKind(lastInput, coarse) {
  if (TITLES[lastInput]) return lastInput;
  return coarse ? 'touch' : 'keys';
}

/**
 * `{ title, rows: [{ label, value }] }` for `kind`. Options: `keys` (SaveStore settings.keys),
 * `movement` (the touch steering mode), `autoAccel` (touch: the car drives itself), `tilt` (on).
 */
export function controlRows(kind, { keys = null, movement = '', autoAccel = true, tilt = false } = {}) {
  let values;
  if (kind === 'pad') values = PAD;
  else if (kind === 'phone') values = PHONE;
  else if (kind === 'touch') {
    values = [tilt ? 'TILT' : movement === 'dpad' ? 'D-PAD' : 'STICK', autoAccel ? 'AUTO' : 'GAS', 'DRIFT', 'WARP', 'NOS', 'JUMP'];
  } else {
    const k = normalizeKeys(keys);
    const named = (id) => {
      const a = ACTIONS.find((x) => x.id === id);
      return [k[id], ...a.fixed].map(keyName).join(' · ');
    };
    values = [`${keyName(k.left)} ${keyName(k.right)} · ← →`, named('up'), named('down'), named('boost'), named('nos'), 'H · E'];
  }
  return { title: TITLES[kind] || TITLES.keys, rows: LABELS.map((label, i) => ({ label, value: values[i] })) };
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Fills `el` with the card while a race is on (paused, or a live race that can't pause); hides it otherwise. */
export function renderControlsRef(el) {
  if (!el) return;
  const racing = GameState.status === 'PAUSED' || GameState.status === 'PLAYING';
  el.classList.toggle('hidden', !racing);
  if (!racing) return;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const kind = controlsKind(InputState.lastInput, coarse);
  const c = SaveStore.data.controls || {};
  const { title, rows } = controlRows(kind, {
    keys: SaveStore.data.settings && SaveStore.data.settings.keys,
    movement: movementFor(c),
    autoAccel: c.autoAccel !== false,
    tilt: Boolean(InputState.tiltEnabled),
  });
  el.dataset.kind = kind;
  el.innerHTML = `<h3>🎮 CONTROLS <small>${title}</small></h3><dl class="ctl-grid">`
    + rows.map((r) => `<div><dt>${r.label}</dt><dd data-ctl="${r.label}">${esc(r.value)}</dd></div>`).join('')
    + '</dl>';
}
