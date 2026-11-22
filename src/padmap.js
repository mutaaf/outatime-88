// Rebindable gamepad buttons (ticket 0298). Pure rules, no imports: the lazy settings panel
// edits the map and applies it; main's pollGamepad (src/input.js) only reads the resolved
// `InputState.padMap` array, so the startup bundle never learns this table.
//
// Five actions each own one face or shoulder button (standard mapping). The triggers stay fixed
// (RT gas, LT brake), as do START (pause), VIEW (steering mode), the left stick click (co-pilot)
// and the D-pad (steering and menus): a player can never lose the throttle, the brake or the pause.
// Saved as SaveStore.data.settings.padMap = { gas: 0, brake: 1, boost: 2, jump: 3, nos: 4 }
// (null = defaults). RB is a second WARP button while WARP is on X and nothing else took RB, as today.

export const PAD_ACTIONS = Object.freeze([
  Object.freeze({ id: 'gas', label: 'GAS', def: 0, also: 'RT' }),
  Object.freeze({ id: 'brake', label: 'BRAKE', def: 1, also: 'LT' }),
  Object.freeze({ id: 'boost', label: 'WARP', def: 2, also: '' }),
  Object.freeze({ id: 'jump', label: 'JUMP', def: 3, also: '' }),
  Object.freeze({ id: 'nos', label: 'NOS', def: 4, also: '' }),
]);

export const DEFAULT_PAD = Object.freeze(Object.fromEntries(PAD_ACTIONS.map((a) => [a.id, a.def])));
const RB = 5;

/** Standard-mapping buttons by their Xbox names (src/pad-glyphs.js renames them per pad family). */
export const BUTTON_NAMES = Object.freeze({
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'VIEW', 9: 'START', 10: 'LS', 11: 'RS',
  12: 'D-PAD', 13: 'D-PAD', 14: 'D-PAD', 15: 'D-PAD',
});
/** Buttons an action may take: the four face buttons, both bumpers and the right stick click. */
export const BINDABLE = Object.freeze([0, 1, 2, 3, 4, 5, 11]);
/** What the fixed buttons do, for the refusal line. */
const FIXED = Object.freeze({ 6: 'BRAKE', 7: 'GAS', 8: 'STEERING MODE', 9: 'PAUSE', 10: 'CO-PILOT', 12: 'MENUS', 13: 'MENUS', 14: 'STEERING', 15: 'STEERING' });

export const buttonName = (i) => BUTTON_NAMES[i] || `BUTTON ${i}`;
const actionOf = (id) => PAD_ACTIONS.find((a) => a.id === id);

/**
 * The saved map, repaired: every action on a bindable button and no button twice. Anything
 * else (wrong types, out-of-range index, a duplicate, a stale save) falls back to the defaults
 * as a whole, never a half-applied map.
 */
export function normalisePadMap(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_PAD };
  const map = { ...DEFAULT_PAD };
  for (const a of PAD_ACTIONS) if (Object.prototype.hasOwnProperty.call(saved, a.id)) map[a.id] = saved[a.id];
  const used = PAD_ACTIONS.map((a) => map[a.id]);
  if (!used.every((b) => Number.isInteger(b) && BINDABLE.includes(b)) || new Set(used).size !== used.length) return { ...DEFAULT_PAD };
  return map;
}

export const isDefaultPad = (map) => PAD_ACTIONS.every((a) => normalisePadMap(map)[a.id] === a.def);

/** The extra WARP button: RB while WARP is on X and no action took RB (today's layout), else none (-1). */
const warp2 = (m) => (m.boost === DEFAULT_PAD.boost && !PAD_ACTIONS.some((a) => m[a.id] === RB) ? RB : -1);

/**
 * Binds `button` to `action`: `{ ok: true, map }` with a new map, or `{ ok: false, reason, by }`
 * when the button is fixed (`by` = what it does) or held by another action (`by` = its label).
 * Conflicts are refused, never swapped.
 */
export function bindPad(map, action, button) {
  const a = actionOf(action);
  const cur = normalisePadMap(map);
  if (!a) return { ok: false, reason: 'unknown' };
  if (!Number.isInteger(button) || button < 0) return { ok: false, reason: 'invalid' };
  if (cur[action] === button) return { ok: true, map: cur };
  if (FIXED[button]) return { ok: false, reason: 'fixed', by: FIXED[button] };
  if (!BINDABLE.includes(button)) return { ok: false, reason: 'invalid' };
  const other = PAD_ACTIONS.find((x) => x.id !== action && cur[x.id] === button);
  if (other) return { ok: false, reason: 'taken', by: other.label };
  return { ok: true, map: { ...cur, [action]: button } };
}

/**
 * What src/input.js pollGamepad reads: `[gas, brake, warp, warp2, jump, nos]` button indices
 * (-1 = none), or null when nothing is rebound (pollGamepad then uses today's buttons).
 */
export function padButtons(map) {
  const m = normalisePadMap(map);
  if (isDefaultPad(m)) return null;
  return [m.gas, m.brake, m.boost, warp2(m), m.jump, m.nos];
}

/** The actions `buttons` (pressed flags by index) drive under `map`: `{ gas, brake, boost, jump, nos }`. */
export function actionsFor(buttons, map) {
  const b = padButtons(map) || [0, 1, 2, RB, 3, 4];
  const on = (i) => i >= 0 && Boolean(buttons[i]);
  return { gas: on(b[0]), brake: on(b[1]), boost: on(b[2]) || on(b[3]), jump: on(b[4]), nos: on(b[5]) };
}

/** Each action's buttons in Xbox names, for the controls card and the panel: `{ gas: 'A · RT', boost: 'X · RB', … }`. */
export function padNames(map) {
  const m = normalisePadMap(map);
  const w2 = warp2(m);
  const out = {};
  for (const a of PAD_ACTIONS) out[a.id] = [buttonName(m[a.id]), a.id === 'boost' && w2 >= 0 ? buttonName(w2) : a.also].filter(Boolean).join(' · ');
  return out;
}

// The prompts (src/racecall.js, src/play-hints.js) are written with the default Xbox buttons:
// "X OR RB" / "X / RB" for WARP, "Y" JUMP, "B / LT" BRAKE, "LB" NOS. A is never renamed in text: the
// prompts that say A mean the pause's resume (src/pad-pause.js), which stays on A.
const TOKEN = /\bX( OR | \/ | · )RB\b|\b(?:LB|[BXY])\b/g;

/** `text` (default Xbox wording) with each action's button as `map` binds it; the same text when nothing is rebound. */
export function padRemapText(text, map) {
  const m = normalisePadMap(map);
  if (isDefaultPad(m)) return text;
  const w2 = warp2(m);
  const by = { B: buttonName(m.brake), X: buttonName(m.boost), Y: buttonName(m.jump), LB: buttonName(m.nos) };
  return String(text).replace(TOKEN, (k, sep) => (sep ? buttonName(m.boost) + (w2 >= 0 ? sep + buttonName(w2) : '') : by[k]));
}

/**
 * Applies the saved map to the game: pollGamepad's button table, and the prompt words through
 * `glyphs` (src/pad-glyphs.js setRemap) once that chunk is in. Returns the normalised map.
 */
export function applyPad(input, saved, glyphs) {
  const m = normalisePadMap(saved);
  input.padMap = padButtons(m);
  if (glyphs && glyphs.setRemap) glyphs.setRemap(input.padMap ? (t) => padRemapText(t, m) : null);
  return m;
}
