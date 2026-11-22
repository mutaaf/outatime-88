// Stick DEADZONE (ticket 0299): Settings → GAMEPAD BUTTONS → SMALL / NORMAL / LARGE. Pure rules, no
// imports, in the lazy settings-panel chunk. Main's src/input.js shapeAxis only reads the radius that
// the panel hands it through setPadDead(), so the startup bundle never learns this table.
//
// Saved as SaveStore.data.settings.padDead = 'small' | 'normal' | 'large'. It has no default in
// src/settings.js (main's budget): unset, an old save or a junk value all read as NORMAL (0.12,
// PAD.dead, today's radius).

export const DEADZONES = Object.freeze({ small: 0.06, normal: 0.12, large: 0.22 });

/** The saved choice, repaired: anything but a known name is 'normal'. */
export const deadzoneName = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEADZONES, v) ? v : 'normal');

/** The radius (0..1 of stick travel) for a saved choice. */
export const deadzoneOf = (v) => DEADZONES[deadzoneName(v)];

/** The preview's readout for a stick position: how far it is pushed, and whether that steers. */
export function stickReadout(x, y, dead) {
  const m = Math.min(1, Math.hypot(x || 0, y || 0));
  const pct = Math.round(m * 100);
  return m <= dead ? `Stick at ${pct}%: inside the deadzone, no steering.` : `Stick at ${pct}%: steering.`;
}
