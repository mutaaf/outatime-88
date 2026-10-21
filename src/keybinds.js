// Rebindable keyboard controls (ticket 0013). Pure rules, a lazy chunk: the settings panel
// edits the bindings, and boot loads this only when a save has rebound a key.
//
// Each driving action has one rebindable key (its default is today's letter key) plus fixed
// keys that always work, so a player can never lock themselves out of steering: the arrows,
// Right Shift. Saved as SaveStore.data.settings.keys = { left: 'KeyJ', … } (null = defaults).
// main.js never learns the table: it translates e.code through InputState.keyMap, which maps
// a rebound key to the default code its action answers to, and a freed default key to ''.

export const ACTIONS = Object.freeze([
  Object.freeze({ id: 'left', label: 'STEER LEFT', def: 'KeyA', fixed: Object.freeze(['ArrowLeft']) }),
  Object.freeze({ id: 'right', label: 'STEER RIGHT', def: 'KeyD', fixed: Object.freeze(['ArrowRight']) }),
  Object.freeze({ id: 'up', label: 'ACCELERATE', def: 'KeyW', fixed: Object.freeze(['ArrowUp']) }),
  Object.freeze({ id: 'down', label: 'BRAKE', def: 'KeyS', fixed: Object.freeze(['ArrowDown']) }),
  Object.freeze({ id: 'boost', label: 'BOOST', def: 'Space', fixed: Object.freeze([]) }),
  Object.freeze({ id: 'nos', label: 'NOS', def: 'ShiftLeft', fixed: Object.freeze(['ShiftRight']) }),
]);

export const DEFAULT_KEYS = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.id, a.def])));

/** Every other key main.js's keydown handler answers to: never bindable (tests/unit/keybinds.test.js reads main.js). */
export const RESERVED = Object.freeze([
  'Enter', 'NumpadEnter', 'Escape', 'Tab', 'Backspace',
  'KeyN', 'KeyH', 'KeyE', 'KeyZ', 'KeyX', 'KeyR', 'KeyQ', 'KeyF', 'KeyB', 'KeyI', 'KeyK',
  'KeyJ', 'KeyG', 'KeyC', 'KeyV', 'KeyT', 'KeyM', 'KeyP',
]);

// Keys a player may pick: letters, digits, the numpad, punctuation, Shift and Space. No
// Ctrl/Alt/Meta (held with a letter they fire browser shortcuts: Ctrl+W closes the tab),
// no function keys, no Caps Lock.
const BINDABLE = /^(Key[A-Z]|Digit[0-9]|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal)|Shift(Left|Right)|Space|Semicolon|Quote|Comma|Period|Slash|Backslash|Bracket(Left|Right)|Minus|Equal|Backquote|Insert|Delete|Home|End|PageUp|PageDown)$/;

const FIXED = new Set(ACTIONS.flatMap((a) => a.fixed));
const actionOf = (id) => ACTIONS.find((a) => a.id === id);

/** Whether a key can hold a driving action at all (before checking the other bindings). */
export const isBindable = (code) => typeof code === 'string' && BINDABLE.test(code) && !RESERVED.includes(code) && !FIXED.has(code);

/**
 * The saved bindings, repaired: a full map with every action bound to a bindable key and no
 * key bound twice. Anything else (a stale or hand-edited save) falls back to the defaults
 * as a whole, never to a half-applied map with two actions on one key.
 */
export function normalizeKeys(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_KEYS };
  const keys = { ...DEFAULT_KEYS };
  for (const a of ACTIONS) if (Object.prototype.hasOwnProperty.call(saved, a.id)) keys[a.id] = saved[a.id];
  const codes = ACTIONS.map((a) => keys[a.id]);
  if (!codes.every(isBindable) || new Set(codes).size !== codes.length) return { ...DEFAULT_KEYS };
  return keys;
}

/**
 * Binds `code` to `action`. Returns `{ ok: true, keys }` with a new map, or
 * `{ ok: false, reason, by }` when the key is reserved, not allowed, or already bound
 * to another action (`by` = that action's label). Conflicts are rejected, never swapped.
 */
export function bindKey(keys, action, code) {
  const a = actionOf(action);
  const cur = normalizeKeys(keys);
  if (!a) return { ok: false, reason: 'unknown' };
  if (cur[action] === code) return { ok: true, keys: cur };
  const fixedFor = ACTIONS.find((x) => x.fixed.includes(code));
  if (fixedFor) return { ok: false, reason: 'taken', by: fixedFor.label };
  if (RESERVED.includes(code)) return { ok: false, reason: 'reserved' };
  if (!isBindable(code)) return { ok: false, reason: 'invalid' };
  const other = ACTIONS.find((x) => x.id !== action && cur[x.id] === code);
  if (other) return { ok: false, reason: 'taken', by: other.label };
  return { ok: true, keys: { ...cur, [action]: code } };
}

export const isDefault = (keys) => ACTIONS.every((a) => normalizeKeys(keys)[a.id] === a.def);

/**
 * What main.js reads: e.code → the code it should act on. null when nothing is rebound (main
 * then uses e.code as is). A freed default key maps to '' (does nothing) unless another
 * action took it.
 */
export function remapFor(keys) {
  const k = normalizeKeys(keys);
  if (isDefault(k)) return null;
  const map = {};
  for (const a of ACTIONS) if (k[a.id] !== a.def) map[a.def] = '';
  for (const a of ACTIONS) if (k[a.id] !== a.def) map[k[a.id]] = a.def;
  return map;
}

const NAMES = {
  Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`', Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PG UP', PageDown: 'PG DN',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
  Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: 'BACKSPACE',
};

/** A key's name on screen: KeyJ → J, Digit4 → 4, Numpad4 → NUM 4, Space → SPACE. */
export function keyName(code) {
  if (typeof code !== 'string' || !code) return '?';
  if (NAMES[code]) return NAMES[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code) || /^Numpad(\d)$/.exec(code);
  if (m) return code.startsWith('Numpad') ? `NUM ${m[1]}` : m[1];
  return code.replace(/(Left|Right)$/, ' $1').toUpperCase();
}

/** Applies saved bindings to the game: main.js's key translation and the boost key prompts name. */
export function applyKeys(input, saved) {
  const k = normalizeKeys(saved);
  input.keyMap = remapFor(k);
  input.boostKey = k.boost === DEFAULT_KEYS.boost ? '' : keyName(k.boost);
  return k;
}
