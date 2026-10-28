// Pause controls reference (ticket 0204): one compact card of the six driving controls for the
// input in hand — keys (rebound ones included, 0013), pad buttons or touch pads. Part of the
// lazy settings-panel chunk; the garage (the Escape/P pause) loads that chunk to draw its copy.
// controlsKind/controlRows are pure; renderControlsRef writes a card.
import { GameState } from './state.js';
import { InputState } from './input.js';
import { SaveStore } from './save.js';
import { ACTIONS, normalizeKeys, keyName } from './keybinds.js';

const TITLES = { keys: 'KEYBOARD', pad: 'GAMEPAD', touch: 'TOUCH' };
const LABELS = ['STEER', 'GAS', 'BRAKE', 'WARP', 'NOS', 'JUMP'];
const PAD = ['L-STICK · D-PAD', 'A · RT', 'B · LT', 'X · RB', 'LB', 'Y'];

/**
 * Which controls to show. No pad button pauses, so the key or click that opened the pause has
 * just set lastInput: a connected pad wins (browsers only reveal a pad once it was pressed on
 * this page). Then the input in hand; before any input, a guess from the pointer.
 */
export function controlsKind(lastInput, coarse, padConnected = false) {
  if (padConnected) return 'pad';
  if (lastInput === 'keys' || lastInput === 'touch' || lastInput === 'pad') return lastInput;
  return coarse ? 'touch' : 'keys';
}

/**
 * `{ title, rows: [{ label, value }] }` for `kind`. Options: `keys` (SaveStore settings.keys),
 * `movement` (the touch kit's steering in effect: stick modes, 'dpad' or 'tilt'), `autoAccel`
 * (touch: the car drives itself).
 */
export function controlRows(kind, { keys = null, movement = '', autoAccel = true } = {}) {
  let values;
  if (kind === 'pad') values = PAD;
  else if (kind === 'touch') {
    values = [movement === 'tilt' ? 'TILT' : movement === 'dpad' ? 'D-PAD' : 'STICK', autoAccel ? 'AUTO' : 'GAS', 'DRIFT', 'WARP', 'NOS', 'JUMP'];
  } else {
    const k = normalizeKeys(keys);
    const named = (id) => [k[id], ...ACTIONS.find((x) => x.id === id).fixed].map(keyName).join(' · ');
    // N is NOS too while racing (main.js), and the card only shows in a race.
    values = [`${keyName(k.left)} ${keyName(k.right)} · ← →`, named('up'), named('down'), named('boost'), `${named('nos')} · N`, 'H · E'];
  }
  return { title: TITLES[kind] || TITLES.keys, rows: LABELS.map((label, i) => ({ label, value: values[i] })) };
}

/** The card's line for the audio aids that are on (0219: the opt-in lane guide), or ''. */
export function aidsNote(settings) {
  return settings && settings.laneGuide === true ? 'LANE GUIDE ON · a tone pans toward the open lane' : '';
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function padConnected() {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return true;
  } catch (e) {}
  return false;
}

/** Fills `el` with the card while a race is on (paused, or a live race that can't pause); hides it otherwise. */
export function renderControlsRef(el) {
  if (!el) return;
  const racing = GameState.status === 'PAUSED' || GameState.status === 'PLAYING';
  el.classList.toggle('hidden', !racing);
  if (!racing) return;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const kind = controlsKind(InputState.lastInput, coarse, padConnected());
  const c = SaveStore.data.controls || {};
  const { title, rows } = controlRows(kind, {
    keys: SaveStore.data.settings && SaveStore.data.settings.keys,
    // Tilt is on or off now (the kit relabels its own mode a frame later); else the kit's mode in effect.
    movement: InputState.tiltEnabled ? 'tilt' : document.documentElement.dataset.tcMovement === 'dpad' ? 'dpad' : '',
    autoAccel: c.autoAccel !== false,
  });
  el.dataset.kind = kind;
  el.innerHTML = `<h3><span aria-hidden="true">🎮 </span>CONTROLS <small>${title}</small></h3><dl class="ctl-grid">`
    + rows.map((r) => `<div><dt>${r.label}</dt><dd data-ctl="${r.label}" aria-label="${esc(r.value.replace(/ · /g, ' or '))}">${esc(r.value)}</dd></div>`).join('')
    + '</dl>';
  const note = aidsNote(SaveStore.data.settings);
  if (note) el.insertAdjacentHTML('beforeend', `<p class="ctl-note" data-aid="laneGuide"><span aria-hidden="true">🔊 </span>${esc(note)}</p>`);
}
