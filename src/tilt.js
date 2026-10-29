// Tilt steering's sensor side (tickets 0050, 0183): the maths that turns a deviceorientation
// reading into steering, and the reader that feeds InputState. A lazy chunk (0223): settings-ui
// fetches it when tilt turns on, so none of it ships at startup. Pure maths unit-tested.
import { createOneEuro } from './onefilter.js';

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

/**
 * The deviceorientation reader. arm() makes the next reading the straight-ahead zero (how you
 * hold it) and calls onSignal; every reading after that goes through a One Euro filter, steady
 * when you hold the phone still, no lag when you swing it (0183; tuned on a 60 Hz sensor with
 * 0.5° noise and a 9 Hz hand tremor: jitter at rest drops ~2.5×, a swerve reaches 90% within
 * one sensor sample, as unfiltered). `save` is SaveStore (sensitivity and invert are read live).
 */
export function createTiltReader(input, save, onSignal, win = window) {
  const filter = createOneEuro({ minCutoff: 0.8, beta: 0.5, snap: 6 }); // a 6°+ jump is a swerve, never jitter
  let armed = false;
  let dotPct = -1;
  return {
    arm() { armed = true; },
    get armed() { return armed; },
    read(e) {
      if (e.beta == null && e.gamma == null) return;
      const angle = tiltAngle(e.beta, e.gamma, screenAngle(win));
      if (armed) {
        armed = false;
        filter.reset();
        input.tiltZeroOffset = angle;
        onSignal();
      }
      if (!input.tiltEnabled) return;
      const raw = filter.filter(angle, e.timeStamp || performance.now());
      input.tiltRawAngle = raw;
      input.tiltSteerVal = tiltSteer(raw, input.tiltZeroOffset, {
        sensitivity: save.data.tiltSensitivity || 1,
        invert: save.data.settings.tiltInvert,
      });
      // The meters move in whole percent: no style write (and layout) for sub-pixel jitter.
      const pct = Math.round(Math.max(6, Math.min(94, 50 + input.tiltSteerVal * 44)));
      if (pct === dotPct) return;
      dotPct = pct;
      for (const id of ['tiltIndicatorDot', 'setTiltDot']) {
        const dot = win.document.getElementById(id);
        if (dot) dot.style.left = `${pct}%`;
      }
    },
  };
}
