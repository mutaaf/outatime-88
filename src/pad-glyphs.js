// Pad button names for the pad in hand (ticket 0283). The prompts are written with Xbox letters
// (src/racecall.js, src/play-hints.js, src/controls-ref.js); a PlayStation or Switch pad reports
// the same standard mapping, so each name is swapped for the button in the same position.
// No imports, and only lazy chunks import() it: a shared chunk would land in main's preload map
// and cost main bytes (lesson 2026-11-17). Text only, no icons.

/** The standard-mapping buttons the prompts name, by their Xbox letters. */
export const PAD_KEYS = Object.freeze(['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'RS']);

const LABELS = Object.freeze({
  xbox: Object.freeze({ A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', RS: 'RS' }),
  ps: Object.freeze({ A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', RS: 'R3' }),
  // Nintendo prints its letters swapped: the bottom face button (standard 0) is B, the left (2) Y.
  switch: Object.freeze({ A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', RS: 'RS' }),
});

/** 'ps' | 'switch' | 'xbox' from a Gamepad.id (vendor 054c Sony, 057e Nintendo); unknown is 'xbox'. */
export function padFamily(id) {
  const s = typeof id === 'string' ? id.toLowerCase() : '';
  // Sony's pads also call themselves just "Wireless Controller"; "Xbox Wireless Controller" must not match.
  if (/vendor: 054c|^054c-|dualsense|dualshock|playstation|^wireless controller/.test(s)) return 'ps';
  if (/vendor: 057e|^057e-|pro controller|joy-con|nintendo/.test(s)) return 'switch';
  return 'xbox';
}

/** `{ A, B, X, Y, LB, RB, LT, RT, RS }` → what that pad prints on those buttons. */
export const padLabels = (family) => LABELS[family] || LABELS.xbox;

// A button name standing alone. "A" is a button only before " ·", " or" or " TO" ("A · RT", "A or
// START", "START OR A TO DRIVE"); anywhere else it is the article ("FOR A ROCKET START"). One
// pass, so Switch's A↔B and X↔Y swaps never chain.
// A rebound button (0298) can also leave a bare "A" in "(A)", "A / LT", "A RIGHT", "OR A!" or alone.
const NAME = /\b(?:[LR][BT]|RS|[BXY]|A(?= ·| or\b| OR\b| TO\b| RIGHT\b| FOR\b| \/| —|[)!]|$))\b/g;

// Rebound buttons (0298, src/padmap.js): the settings panel hands over a text function that renames
// each action's default button to the one the player bound, applied before the family's names.
let remap = null;
const tables = new Map();
/** Sets (or clears, null) the rebound-button rename for padText and padTable. */
export function setRemap(fn) { remap = typeof fn === 'function' ? fn : null; tables.clear(); }

/** `text` (Xbox wording) with each button named for `family`; `raw` skips the rebound-button rename (text already names them). */
export function padText(text, family, raw = false) {
  const l = padLabels(family);
  const t = remap && !raw ? remap(String(text)) : text;
  return l === LABELS.xbox ? t : String(t).replace(NAME, (k) => l[k]);
}

/** A frozen copy of a prompt table (`{ key: text }`) for `family`, built once; Xbox with nothing rebound gets `table` itself. */
export function padTable(table, family = heldFamily()) {
  if (!remap && padLabels(family) === LABELS.xbox) return table;
  let byFamily = tables.get(table);
  if (!byFamily) tables.set(table, (byFamily = {}));
  if (!byFamily[family]) {
    const out = {};
    for (const k of Object.keys(table)) out[k] = padText(table[k], family);
    byFamily[family] = Object.freeze(out);
  }
  return byFamily[family];
}

// The pad in hand is the first connected one (src/input.js pollGamepad drives with it). Read on
// connect and disconnect, never per frame (getGamepads() allocates in Chrome).
let held = 'xbox';
/** Re-reads the pad in hand and returns its family (for a listener that may run before ours). */
export function scan() {
  held = 'xbox';
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { held = padFamily(pads[i].id); break; }
  } catch (e) { /* blocked by permissions policy */ }
  return held;
}
if (typeof window !== 'undefined') {
  scan();
  window.addEventListener('gamepadconnected', scan);
  window.addEventListener('gamepaddisconnected', scan);
}
/** The family of the pad in hand ('xbox' with none). */
export const heldFamily = () => held;

const SPOKEN = { '✕': 'Cross', '○': 'Circle', '□': 'Square', '△': 'Triangle' };
/** `text` with the PlayStation shapes as words, for an aria-label (a screen reader says "✕" as "multiplication x"). */
export const padSpoken = (text) => String(text).replace(/[✕○□△]/g, (c) => SPOKEN[c]);

const escHTML = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** `text` as HTML whose PlayStation shapes carry their spoken name (role="img"), for live text and buttons. */
export const padHTML = (text) => escHTML(text).replace(/[✕○□△]/g, (c) => `<span role="img" aria-label="${SPOKEN[c]}">${c}</span>`);
