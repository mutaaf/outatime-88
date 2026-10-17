// Touch-control settings (ticket 0061), stored under SaveStore.data.controls. New fields get
// defaults by merging (AGENTS.md §3.6 save compatibility); unknown values fall back.
// Kept free of layouts.js so the save module (main chunk) doesn't pull the layout engine in.
export const MOVEMENT_MODES = ['dynamic', 'floating', 'fixed', 'dpad', 'tilt'];
export const PRESET_MOVEMENT = { default: 'dynamic', roblox: 'dynamic', fortnite: 'floating', lefty: 'dynamic', claw: 'floating', tablet: 'floating' };

export const CONTROL_DEFAULTS = Object.freeze({
  preset: 'default',
  movement: '',          // '' = the preset's own movement mode
  sensitivity: 1.0,      // steering multiplier, 0.5–1.5
  deadZone: 0.12,        // 0.04–0.3 of the stick radius
  curve: 1.5,            // 1 = linear, higher = finer near centre
  opacity: 0.9,          // all controls, 0.3–1
  size: 1.0,             // all controls, 0.8–1.3
  autoAccel: true,       // the car drives itself forward; no gas button needed
  stickThrottle: false,  // push the stick up/down for gas/brake
  steerAssist: false,    // gentle lane-centering when you let go
  haptics: true,
  hapticStrength: 1,     // 0.3–1; low skips the crash/lap rumbles
  coachSeen: false,      // first-run "where do my thumbs go" overlay
  special: 'ROAR',       // what SPECIAL fires (long-press it to switch)
  layouts: {},           // { 'phone-portrait': { items: {...} }, ... } from the layout editor
});

const RANGES = {
  sensitivity: [0.5, 1.5], deadZone: [0.04, 0.3], curve: [1, 2.5], opacity: [0.3, 1], size: [0.8, 1.3], hapticStrength: [0.3, 1],
};

/** Merge saved controls over defaults and repair anything out of range. Never throws. */
export function normalizeControls(saved) {
  const c = Object.assign({}, CONTROL_DEFAULTS, saved && typeof saved === 'object' ? saved : {});
  c.layouts = Object.assign({}, c.layouts);
  if (!PRESET_MOVEMENT[c.preset]) c.preset = 'default';
  if (c.movement && !MOVEMENT_MODES.includes(c.movement)) c.movement = '';
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    const n = Number(c[k]);
    c[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : CONTROL_DEFAULTS[k];
  }
  for (const k of ['autoAccel', 'stickThrottle', 'steerAssist', 'haptics', 'coachSeen']) c[k] = !!c[k];
  if (!['ZONE', 'AGRO', 'ROAR'].includes(c.special)) c.special = 'ROAR';
  if (!c.layouts || typeof c.layouts !== 'object' || Array.isArray(c.layouts)) c.layouts = {};
  return c;
}

/** The movement mode in effect: the player's override, else the preset's. */
export function movementFor(c) {
  return c.movement || PRESET_MOVEMENT[c.preset] || PRESET_MOVEMENT.default;
}
