// The real loop (2D view): the geometry of a vertical loop and a chase camera that rides it.
//
// The 2D renderer fakes bends with a shifting road, which cannot go upside down. Inside a loop
// src/setpieces-2d.js drawLoopRide() switches to a true perspective projection of the loop
// built here: the road climbs a vertical circle, rolls over the top and comes down beside its
// entry (the same shape src/render3d/path.js gives the 3D view). The camera sits behind and
// above the car in the road's own frame, so the sky and ground turn through 360° round you
// while the car stays planted at the bottom of the screen.
//
// Loop space, in metres: x right, y up, z along the entry heading; the loop starts at the
// origin. `s` is sim track Z relative to the loop's start (f.z0): negative on the run-in,
// 0..f.length round the loop, past f.length on the exit lane. Pure: no DOM, no canvas.
import { loopShift } from './render3d/path.js';

export const LOOP_CAM = {
  zScale: 0.03,  // metres per sim Z (the 3D view's scale, so both views draw the same loop)
  halfW: 11,     // road half-width (m)
  back: 6.25,    // camera distance behind the car (m) …
  up: 4.6,       // … and height above the road; with `depth` these reproduce the 2D framing
  depth: 0.86,   // focal length in half-screens (ROAD_CFG.cameraDepth)
  fade: 1000,    // sim Z over which the ride view blends in before the loop and out after it
};

export const loopRadius = (f) => (f.length / (2 * Math.PI)) * LOOP_CAM.zScale;
export const loopExitShift = () => loopShift(LOOP_CAM.halfW);

/** Angle round the loop (0..2π) at `s`; 0 on the run-in, 2π on the exit. */
export function loopAngle(f, s) {
  return 2 * Math.PI * Math.max(0, Math.min(1, s / f.length));
}

/**
 * Centreline point and frame at `s`, `lat` half-widths right of centre. Writes x, y, z, the
 * forward (fy, fz) and up (uy, uz) components (right is always +x) and the angle `a`.
 */
export function loopPoint(f, s, lat, out) {
  const zs = LOOP_CAM.zScale;
  const shift = loopExitShift();
  const off = lat * LOOP_CAM.halfW;
  if (s <= 0) {
    out.x = off; out.y = 0; out.z = s * zs; out.a = 0;
  } else if (s >= f.length) {
    out.x = shift + off; out.y = 0; out.z = (s - f.length) * zs; out.a = 2 * Math.PI;
  } else {
    const a = loopAngle(f, s), R = loopRadius(f);
    out.x = shift * (a / (2 * Math.PI)) + off;
    out.y = R * (1 - Math.cos(a));
    out.z = R * Math.sin(a);
    out.a = a;
  }
  out.fy = Math.sin(out.a); out.fz = Math.cos(out.a);
  out.uy = Math.cos(out.a); out.uz = -Math.sin(out.a);
  return out;
}

const pa = {}, pb = {}, pc = {};
const smooth = (k) => k * k * (3 - 2 * k);

/**
 * The chase camera for a car at `s`, `lat` half-widths across. Writes the eye (ex, ey, ez) and
 * the view's forward/up (fy, fz, uy, uz; right is +x). When the car peeled off at progress
 * `peelT` (too slow over the top), it falls from that point back down to the exit lane, nose
 * first, while the sim carries on round: `fall` (0..1) says how far down it is.
 */
export function loopCamera(f, s, lat, peelT, out) {
  const back = LOOP_CAM.back / LOOP_CAM.zScale;
  let a;
  if (peelT != null && s > peelT * f.length && s < f.length) {
    const k = (s - peelT * f.length) / ((1 - peelT) * f.length);
    const e = smooth(k);
    loopPoint(f, peelT * f.length, lat, pa);
    loopPoint(f, f.length, lat, pb);
    // Drops like a stone (y eases in with k²), sliding across to land on the exit lane.
    const cx = pa.x + (pb.x - pa.x) * e, cy = pa.y * (1 - k * k), cz = pa.z + (pb.z - pa.z) * e;
    a = pa.a + (2 * Math.PI - pa.a) * e;
    const fy = Math.sin(a), fz = Math.cos(a), uy = Math.cos(a), uz = -Math.sin(a);
    out.ex = cx; out.ey = cy - fy * LOOP_CAM.back + uy * LOOP_CAM.up; out.ez = cz - fz * LOOP_CAM.back + uz * LOOP_CAM.up;
    out.fall = k;
  } else {
    // Ride the frame: the eye is on the road behind the car, aimed along the frame between it
    // and the car so the road ahead stays framed as it curls up.
    loopPoint(f, s - back, lat, pa);
    loopPoint(f, s - back * 0.5, lat, pb);
    a = pb.a;
    // Sideways it tracks the car (the loop drifts across a road width), like the 2D camera.
    out.ex = loopPoint(f, s, lat, pc).x; out.ey = pa.y + pa.uy * LOOP_CAM.up; out.ez = pa.z + pa.uz * LOOP_CAM.up;
    out.fall = 0;
  }
  out.a = a;
  out.fy = Math.sin(a); out.fz = Math.cos(a);
  out.uy = Math.cos(a); out.uz = -Math.sin(a);
  return out;
}

/**
 * Project loop-space point (x, y, z) through camera `c` onto a W×H screen with the 2D view's
 * focal lengths. Writes sx, sy and the camera depth cz into `o`; returns false if it is behind
 * the near plane (the caller clips).
 */
export function projectLoop(c, x, y, z, W, H, o) {
  const dx = x - c.ex, dy = y - c.ey, dz = z - c.ez;
  const cy = dy * c.uy + dz * c.uz;
  const cz = dy * c.fy + dz * c.fz;
  o.cx = dx; o.cy = cy; o.cz = cz;
  if (cz <= NEAR) return false;
  o.sx = W / 2 + (LOOP_CAM.depth * W / 2) * dx / cz;
  o.sy = H / 2 - (LOOP_CAM.depth * H / 2) * cy / cz;
  return true;
}
export const NEAR = 0.3;

/** How much of the ride view shows (0..1) with the car at `s`: blends in before, out after. */
export function rideBlend(f, s) {
  const k = LOOP_CAM.fade;
  if (s < -k || s > f.length + k) return 0;
  if (s < 0) return smooth(1 + s / k);
  if (s > f.length) return smooth(1 - (s - f.length) / k);
  return 1;
}

/** Screen row of the horizon and which side the sky is on (+1: above). Null if off-screen. */
export function horizonRow(c, H) {
  // A camera-space ray (X, Y, 1) is level when Y·uy + fy = 0.
  const fyc = LOOP_CAM.depth * H / 2;
  if (Math.abs(c.uy) < 1e-4) return { row: c.fy > 0 ? Infinity : -Infinity, skyUp: 1 };
  const Y = -c.fy / c.uy;
  return { row: H / 2 - fyc * Y, skyUp: c.uy > 0 ? 1 : -1 };
}
