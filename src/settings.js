// Player settings (ticket 0050): tilt steering, sound levels, motion and difficulty. Touch
// control layout is edited by the controls editor, which hooks into the panel's EDIT CONTROLS. Pure rules here (unit-tested); src/settings-ui.js owns the panel and the DOM.
//
// Saved under SaveStore.data.settings (invariant 6): load() merges these defaults under the
// saved object, so adding a key later never breaks an old save. Tilt sensitivity predates
// this module and stays at its original top-level field, SaveStore.data.tiltSensitivity.

export const SETTINGS_DEFAULTS = Object.freeze({
  tilt: false,            // steer by tilting the device (re-asked for permission each visit on iOS)
  tiltInvert: false,      // flip left/right if your device reports the other way round
  musicVolume: 0.8,       // 0..1, on top of the master volume
  sfxVolume: 1,           // 0..1, engine + effects
  musicStyle: 'auto',     // 'auto' (synthwave in the '88 eras, street beats elsewhere + Endless tier 3+) | 'synthwave' | 'street' (0193)
  voice: true,            // the race announcer reads names and calls out loud (on-device speech)
  motion: 'auto',         // 'auto' follows the OS; 'reduce' always calms shakes and flashes; 'full'
  difficulty: 'normal',   // 'easy' | 'normal' | 'hard'
  graphics: 'auto',       // 'auto' (device-picked tier, src/perf/) | 'low' | 'medium' | 'high' | 'ultra'
  steer: '',              // steering mode (src/steermode.js): '' = this device's natural one
  assist: '',             // co-pilot: 'off' | 'assist' | 'auto'; '' = the touch kit's old switch
  keys: null,             // rebound keyboard keys { left: 'KeyJ', … } (0013, src/keybinds.js); null = defaults
});

export const DIFFICULTY = Object.freeze({
  easy: { rivalPace: 0.86, damage: 0.65, label: 'EASY' },
  normal: { rivalPace: 1, damage: 1, label: 'NORMAL' },
  hard: { rivalPace: 1.1, damage: 1.3, label: 'HARD' },
});

const CHOICES = {
  motion: ['auto', 'reduce', 'full'], difficulty: Object.keys(DIFFICULTY), graphics: ['auto', 'low', 'medium', 'high', 'ultra'],
  steer: ['', 'keys', 'mouse', 'stick', 'dpad', 'tilt'], assist: ['', 'off', 'assist', 'auto'],
  musicStyle: ['auto', 'synthwave', 'street'],
};
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** Defaults merged under whatever was saved, with every value forced back into range. */
export function normalizeSettings(saved) {
  const s = Object.assign({}, SETTINGS_DEFAULTS, saved && typeof saved === 'object' ? saved : {});
  s.tilt = Boolean(s.tilt);
  s.tiltInvert = Boolean(s.tiltInvert);
  s.voice = s.voice !== false;
  s.musicVolume = clamp01(Number(s.musicVolume), SETTINGS_DEFAULTS.musicVolume);
  s.sfxVolume = clamp01(Number(s.sfxVolume), SETTINGS_DEFAULTS.sfxVolume);
  for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(s[k])) s[k] = SETTINGS_DEFAULTS[k];
  return s;
}

export const difficultyOf = (settings) => DIFFICULTY[settings && settings.difficulty] || DIFFICULTY.normal;

/** Reduced motion is on when the player asks for it, or when 'auto' and the OS asks. */
export const reducedMotionFor = (motion, systemReduce) => motion === 'reduce' || (motion !== 'full' && Boolean(systemReduce));

// --- Tilt -------------------------------------------------------------------------------

export const TILT = Object.freeze({ deadzone: 2, range: 24, clamp: 28 });

/**
 * Current screen rotation in degrees (0, 90, 180, 270). When the reported angle contradicts
 * the viewport's shape (some browsers and emulators report the desktop screen's angle), the
 * shape wins: a tall viewport is portrait, a wide one landscape.
 */
export function screenAngle(win = globalThis) {
  const so = win.screen && win.screen.orientation;
  let a = so && typeof so.angle === 'number' ? so.angle : Number(win.orientation) || 0;
  a = ((a % 360) + 360) % 360;
  const w = win.innerWidth, h = win.innerHeight;
  if (w && h) {
    const sideways = a === 90 || a === 270;
    if (h > w && sideways) return 0;
    if (w > h && !sideways) return 90;
  }
  return a;
}

/**
 * The device's left/right tilt in degrees, for how the screen is rotated right now. Portrait
 * steers with gamma; landscape with beta, whose sign flips between the two landscape
 * rotations (without this, one way round steered backwards).
 */
export function tiltAngle(beta, gamma, angle) {
  const b = Number(beta) || 0;
  const g = Number(gamma) || 0;
  switch (angle) {
    case 90: return b;
    case 270: return -b;
    case 180: return -g;
    default: return g;
  }
}

/** Steering in -1..1 from a raw tilt angle, the recentred zero, sensitivity and invert. */
export function tiltSteer(rawDeg, zeroDeg, { sensitivity = 1, invert = false } = {}) {
  let d = (rawDeg - zeroDeg + 540) % 360 - 180; // shortest way round, so ±180 never jumps
  d = Math.max(-TILT.clamp, Math.min(TILT.clamp, d));
  if (Math.abs(d) < TILT.deadzone) return 0;
  const sign = invert ? -1 : 1;
  const v = sign * (d - Math.sign(d) * TILT.deadzone) / (TILT.range - TILT.deadzone) * sensitivity;
  return Math.max(-1, Math.min(1, v));
}

/** What the settings panel should say about tilt right now. */
export function tiltStatusText(status) {
  switch (status) {
    case 'on': return 'Tilt is ON. Hold the device how you like and tap RECENTER.';
    case 'waiting': return 'Waiting for the tilt sensor…';
    case 'denied': return 'Tilt was blocked. Allow Motion & Orientation for this site in your browser settings, then try again.';
    case 'unsupported': return 'This device has no tilt sensor. Use the touch pads or a gamepad.';
    case 'nosignal': return 'No tilt sensor found on this device. Use the touch pads or a gamepad.';
    default: return 'Tilt is OFF. Turn it on to steer by tilting.';
  }
}
