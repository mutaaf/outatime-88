// Steering modes (ticket 0130): one switch for how you steer, and how much the co-pilot helps.
//
// Pure rules here (unit-tested); src/steermode-ui.js wires them to keys, the HUD pill, the
// gamepad, the settings panel and the touch kit. Saved under SaveStore.data.settings as
// `steer` ('' = this device's natural mode) and `assist` ('' = follow the touch kit's older
// steer-assist switch), so old saves load unchanged.

export const STEER_MODES = Object.freeze({
  keys: { label: 'KEYS', icon: '⌨️', hint: '← → OR A D TO STEER' },
  mouse: { label: 'MOUSE', icon: '🖱️', hint: 'MOVE THE MOUSE LEFT AND RIGHT' },
  stick: { label: 'JOYSTICK', icon: '🕹️', hint: 'THUMBSTICK ON THE LEFT' },
  dpad: { label: 'D-PAD', icon: '✚', hint: 'TAP ◀ ▶ TO STEER' },
  tilt: { label: 'TILT', icon: '📱', hint: 'TILT TO STEER · HOLD STILL TO CENTER' },
});
export const STEER_IDS = Object.keys(STEER_MODES);

// Co-pilot levels, mapped onto GameState.jarvisMode (0 assist, 1 autopilot, 2 manual).
export const ASSISTS = Object.freeze([
  { id: 'off', jarvis: 2, label: 'ASSIST OFF', icon: '🙌', hint: 'ALL YOU' },
  { id: 'assist', jarvis: 0, label: 'SMART ASSIST', icon: '🛟', hint: 'KEEPS YOU OFF THE WALLS WHEN YOU LET GO' },
  { id: 'auto', jarvis: 1, label: 'AUTOPILOT', icon: '🤖', hint: 'THE CAR DRIVES ITSELF' },
]);
export const ASSIST_IDS = ASSISTS.map((a) => a.id);

/**
 * The steering modes this device can use, in cycle order. `env`: { fine (a mouse or
 * trackpad), touch, tilt (an orientation sensor API) }. Keyboard is always there on a device
 * with a fine pointer; a phone gets the touch modes; tilt needs both touch and the sensor API.
 */
export function availableModes(env = {}) {
  const out = [];
  if (env.fine || !env.touch) out.push('keys', 'mouse');
  if (env.touch) out.push('stick', 'dpad');
  if (env.touch && env.tilt) out.push('tilt');
  return out;
}

/** The saved mode if this device has it, else the device's natural one (touch first on touch). */
export function resolveMode(saved, list, env = {}) {
  if (list.includes(saved)) return saved;
  if (env.touch && list.includes('stick')) return 'stick';
  return list[0] || 'keys';
}

/** The next mode in `list` after `cur` (dir −1 goes back). */
export function nextMode(cur, list, dir = 1) {
  if (!list.length) return cur;
  const i = list.indexOf(cur);
  return list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length];
}

export const assistById = (id) => ASSISTS.find((a) => a.id === id) || ASSISTS[0];
export const assistForJarvis = (j) => ASSISTS.find((a) => a.jarvis === j) || ASSISTS[0];

/**
 * The next assist level. Live races skip AUTOPILOT: friends racing each other drive their own
 * cars (the co-pilot's smart assist is still allowed).
 */
export function nextAssist(cur, { live = false } = {}) {
  const ids = live ? ASSIST_IDS.filter((a) => a !== 'auto') : ASSIST_IDS;
  const i = ids.indexOf(cur);
  return ids[(i + 1) % ids.length];
}

/** The level in effect for a race: a live race turns AUTOPILOT into SMART ASSIST. */
export const effectiveAssist = (id, live) => (live && id === 'auto' ? 'assist' : ASSIST_IDS.includes(id) ? id : 'off');

/** Saved assist, or (first run after this shipped) the touch kit's older steer-assist switch. */
export const savedAssist = (settings, controls) => (ASSIST_IDS.includes(settings && settings.assist) ? settings.assist : controls && controls.steerAssist ? 'assist' : 'off');

/**
 * Mouse steering: the pointer's distance from the screen's centre line, −1..1 at ±30% of the
 * width, with a small dead zone in the middle and a gentle curve for fine corrections.
 */
export const MOUSE = Object.freeze({ reach: 0.3, dead: 0.04, curve: 1.35 });
export function mouseSteer(x, width) {
  if (!(width > 0)) return 0;
  const r = (x - width / 2) / (width * MOUSE.reach);
  const a = Math.abs(r);
  if (a <= MOUSE.dead) return 0;
  const k = Math.min(1, (a - MOUSE.dead) / (1 - MOUSE.dead));
  return Math.sign(r) * k ** MOUSE.curve;
}

/** Touch kit movement for a steering mode ('' keeps the preset's own stick style). */
export function touchMovementFor(mode, current) {
  if (mode === 'dpad') return 'dpad';
  if (mode === 'tilt') return 'tilt';
  if (mode === 'stick') return current === 'dpad' || current === 'tilt' ? '' : current || '';
  return current || '';
}
