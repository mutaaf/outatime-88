// Pad button names for the pad in hand (ticket 0283). The prompts are written with Xbox letters
// (src/racecall.js, src/play-hints.js, src/controls-ref.js); a PlayStation or Switch pad reports
// the same standard mapping, so each name is swapped for the button in the same position.
// No imports, and only lazy chunks import() it: a shared chunk would land in main's preload map
// and cost main bytes (lesson 2026-11-17). Text only, no icons.

/** The standard-mapping buttons the prompts name, by their Xbox letters. */
export const PAD_KEYS = Object.freeze(['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT']);

const LABELS = Object.freeze({
  xbox: Object.freeze({ A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT' }),
  ps: Object.freeze({ A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2' }),
  // Nintendo prints its letters swapped: the bottom face button (standard 0) is B, the left (2) Y.
  switch: Object.freeze({ A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR' }),
});

/** 'ps' | 'switch' | 'xbox' from a Gamepad.id (vendor 054c Sony, 057e Nintendo); unknown is 'xbox'. */
export function padFamily(id) {
  const s = typeof id === 'string' ? id.toLowerCase() : '';
  // Sony's pads also call themselves just "Wireless Controller"; "Xbox Wireless Controller" must not match.
  if (/vendor: 054c|^054c-|dualsense|dualshock|playstation|^wireless controller/.test(s)) return 'ps';
  if (/vendor: 057e|^057e-|pro controller|joy-con|nintendo/.test(s)) return 'switch';
  return 'xbox';
}

/** `{ A, B, X, Y, LB, RB, LT, RT }` → what that pad prints on those buttons. */
export const padLabels = (family) => LABELS[family] || LABELS.xbox;

// A button name standing alone. "A" is a button only before " ·", " or" or " TO" ("A · RT", "A or
// START", "START OR A TO DRIVE"); anywhere else it is the article ("FOR A ROCKET START"). One
// pass, so Switch's A↔B and X↔Y swaps never chain.
const NAME = /\b(?:[LR][BT]|[BXY]|A(?= ·| or\b| OR\b| TO\b))\b/g;

/** `text` (Xbox wording) with each button named for `family`. */
export function padText(text, family) {
  const l = padLabels(family);
  return l === LABELS.xbox ? text : String(text).replace(NAME, (k) => l[k]);
}

const tables = new Map();
/** A frozen copy of a prompt table (`{ key: text }`) for `family`, built once; Xbox gets `table` itself. */
export function padTable(table, family = heldFamily()) {
  if (padLabels(family) === LABELS.xbox) return table;
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
