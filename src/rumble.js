// Gamepad RUMBLE strength (ticket 0300): Settings → GAMEPAD BUTTONS → OFF / LOW / FULL. Pure rules, no
// imports, shared by the lazy force-feel chunk (src/forcefeel.js scales both motors) and the lazy
// settings panel (the choice and its TEST button).
//
// Saved as SaveStore.data.settings.rumble = 'off' | 'low' | 'full'. No default in src/settings.js (main's
// budget): unset, an old save or a junk value all read as FULL (today's rumble, unchanged).

export const RUMBLE = Object.freeze({ off: 0, low: 0.5, full: 1 });

/** The saved choice, repaired: anything but a known name is 'full'. */
export const rumbleName = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(RUMBLE, v) ? v : 'full');

/** The motor scale (0..1) for a saved choice. */
export const rumbleScale = (v) => RUMBLE[rumbleName(v)];

/** How long the panel's TEST buzz lasts. */
export const TEST_MS = 300;

/** The first connected pad's rumble motor (the pad src/input.js steers with), or null. */
export function padActuator(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav || !nav.getGamepads) return null;
  try {
    const pads = nav.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) return p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]) || null;
    }
  } catch (e) { /* blocked */ }
  return null;
}

/** True when a pad is connected at all (with or without a motor). */
export function padConnected(nav = typeof navigator === 'undefined' ? null : navigator) {
  try {
    const pads = nav && nav.getGamepads ? nav.getGamepads() : null;
    if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return true;
  } catch (e) { /* blocked */ }
  return false;
}

/**
 * The panel's TEST: one TEST_MS buzz on both motors at the chosen level.
 * @returns {'nopad'|'nomotor'|'off'|'ok'} what happened, for the panel's text
 */
export function testRumble(choice, nav) {
  const k = rumbleScale(choice);
  if (!padConnected(nav)) return 'nopad';
  const act = padActuator(nav);
  if (!act) return 'nomotor';
  if (k === 0) return 'off';
  try {
    if (typeof act.playEffect === 'function') {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: TEST_MS, weakMagnitude: k, strongMagnitude: k });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else if (typeof act.pulse === 'function') act.pulse(k, TEST_MS);
    else return 'nomotor';
  } catch (e) { return 'nomotor'; }
  return 'ok';
}

/** The panel's words for a TEST result (text, not only colour). */
export function testText(result, choice) {
  if (result === 'nopad') return 'No gamepad connected. Plug one in and press a button on it, then TEST again.';
  if (result === 'nomotor') return "This gamepad or browser can't rumble.";
  if (result === 'off') return 'Rumble is OFF: the pad stays still.';
  return `Buzzing at ${rumbleName(choice).toUpperCase()}.`;
}
