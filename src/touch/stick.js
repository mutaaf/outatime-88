// Thumbstick and D-pad math (ticket 0061). Pure, allocation-free (results go into a caller-owned
// `out` object), so the per-frame sampler and the unit tests share exactly the same code.

export const STICK_DEFAULTS = Object.freeze({ deadZone: 0.12, curve: 1.5 });

/**
 * Pointer offset from the stick centre → analog vector in [-1, 1].
 * Radial dead zone (no snapping to an axis), the remaining travel rescaled to 0..1 so there is
 * no jump at the edge of the dead zone, then a power curve on the magnitude: >1 gives finer
 * control near centre (kids' small corrections) while full deflection still reaches 1.
 */
export function stickVector(dx, dy, radius, deadZone, curve, out) {
  const r = radius > 0 ? radius : 1;
  const len = Math.hypot(dx, dy);
  const raw = Math.min(1, len / r);
  if (raw <= deadZone || len === 0) {
    out.x = 0; out.y = 0; out.mag = 0;
    return out;
  }
  const live = (raw - deadZone) / (1 - deadZone);
  const mag = Math.pow(live, curve > 0 ? curve : 1);
  out.x = (dx / len) * mag;
  out.y = (dy / len) * mag;
  out.mag = mag;
  return out;
}

/**
 * Dynamic recentering ("floating" stick): when the thumb drifts past the ring, drag the ring's
 * centre along behind it so the stick never needs the thumb to come back. Mutates `origin`.
 * Returns true if the origin moved.
 */
export function followThumb(origin, x, y, radius) {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len <= radius) return false;
  const k = (len - radius) / len;
  origin.x += dx * k;
  origin.y += dy * k;
  return true;
}

/** Clamp a knob position to the ring (fixed stick, or for drawing). Mutates `p`. */
export function clampToRing(p, cx, cy, radius) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const len = Math.hypot(dx, dy);
  if (len > radius) {
    p.x = cx + (dx / len) * radius;
    p.y = cy + (dy / len) * radius;
  }
  return p;
}

// D-pad: 8 directions, numbered clockwise from east in screen space (y down):
// 0 none, 1 E, 2 SE, 3 S, 4 SW, 5 W, 6 NW, 7 N, 8 NE.
const DIR_X = [0, 1, 1, 0, -1, -1, -1, 0, 1];
const DIR_Y = [0, 0, 1, 1, 1, 0, -1, -1, -1];

/** Pointer offset from the pad centre → direction 0..8 (0 inside the dead radius). */
export function dpadDirection(dx, dy, deadPx) {
  if (Math.hypot(dx, dy) < deadPx) return 0;
  let a = Math.atan2(dy, dx); // -π..π, 0 = east, +π/2 = south (screen y down)
  if (a < 0) a += Math.PI * 2;
  const sector = Math.round(a / (Math.PI / 4)) % 8; // 0 = E … 7 = NE
  return sector + 1;
}

/** Writes the direction's axes (-1, 0, 1) into out.x/out.y. */
export function dpadAxes(dir, out) {
  out.x = DIR_X[dir] || 0;
  out.y = DIR_Y[dir] || 0;
  return out;
}

/**
 * Steering smoothing for small hands: approach the target at `rise` per second, and return to
 * centre faster (`fall`) so letting go always straightens the car promptly. Frame-rate
 * independent; never overshoots.
 */
export function smoothSteer(current, target, dt, rise = 9, fall = 16) {
  const releasing = Math.abs(target) < Math.abs(current) || (current !== 0 && Math.sign(target) !== Math.sign(current));
  const rate = releasing ? fall : rise;
  const step = rate * dt;
  const diff = target - current;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}
