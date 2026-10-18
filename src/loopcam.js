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

const pa = {}, pb = {}, pc = {}, pd = {};
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerpAngle = (a, b, k) => a + (b - a) * k;

/**
 * Falling off the top (too slow over the top of a loop): a real ballistic arc in loop space.
 * The car leaves the track at progress `peelT` along the tangent at the sim's speed `ups`
 * (sim Z per second), gravity pulls it straight down, and it lands back on the loop's far side
 * (or the exit lane). The sim carries on round the loop at its own pace and leaves it at
 * s = f.length, so the fall is laid out on the sim's own progress: `k` (0..1) from the peel
 * point to the exit. The arc lands at `kHit`; the car then rides the rest of the loop down to
 * the exit, so what you see lands exactly when the sim leaves the loop. Memoized (one per
 * peel); deterministic.
 *
 * Returns { a0, aHit, kHit, T, g, vy, vz, y0, z0 } (angles in radians, metres, seconds).
 */
let fallMemo = null;
export function peelFall(f, peelT, ups) {
  const key = f.id + ':' + peelT + ':' + Math.round(ups);
  if (fallMemo && fallMemo.key === key) return fallMemo;
  const R = loopRadius(f);
  const a0 = loopAngle(f, peelT * f.length);
  const sPeel = peelT * f.length;
  const T = Math.max(0.4, (f.length - sPeel) / Math.max(200, ups));
  const v = Math.max(200, ups) * LOOP_CAM.zScale;
  const y0 = R * (1 - Math.cos(a0)), z0 = R * Math.sin(a0);
  const vy = v * Math.sin(a0), vz = v * Math.cos(a0);
  // Where (and when) an arc under gravity g comes back to the track.
  const hit = (g) => {
    const n = 240, dt = T / n;
    for (let i = 1; i <= n; i++) {
      const t = i * dt;
      const y = y0 + vy * t - 0.5 * g * t * t, z = z0 + vz * t;
      if (y <= 0) return { t, a: 2 * Math.PI };
      const dy = y - R;
      if (i > 2 && dy * dy + z * z >= R * R) {
        let a = Math.atan2(z, R - y);
        if (a < a0) a += 2 * Math.PI;
        return { t, a: Math.min(2 * Math.PI, a) };
      }
    }
    return { t: Infinity, a: 2 * Math.PI };
  };
  // Pick g so the arc lands about half way to the exit: slow enough to watch, and it has to be
  // well over v²/R so it visibly drops away rather than skimming the road. Bisect (hit time
  // falls with g).
  let lo = 3 * v * v / R, hi = Math.max(lo * 4, 4000);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (hit(mid).t > 0.5 * T) lo = mid; else hi = mid;
  }
  const g = hi;
  const h = hit(g);
  fallMemo = { key, a0, aHit: h.a, kHit: Math.min(0.95, h.t / T), T, g, vy, vz, y0, z0 };
  return fallMemo;
}

/**
 * The player's car at sim progress `s` after peeling off at `peelT` (null: no peel; the car is
 * on the track at s). Writes the car's loop-space position (x, y, z), its body angle `a` (the
 * frame angle its forward/up use), `air` (true while flying) and `bounce` (landing bounce, m).
 */
export function carPose(f, s, lat, peelT, ups, out) {
  out.air = false; out.bounce = 0;
  if (peelT == null || s <= peelT * f.length || s >= f.length) {
    loopPoint(f, s, lat, pd);
    out.x = pd.x; out.y = pd.y; out.z = pd.z; out.a = pd.a; out.k = -1;
    return out;
  }
  const P = peelFall(f, peelT, ups);
  const k = (s - peelT * f.length) / ((1 - peelT) * f.length);
  out.k = k;
  const shift = loopExitShift(), off = lat * LOOP_CAM.halfW;
  if (k < P.kHit) {
    const t = k * P.T, e = k / P.kHit;
    out.y = P.y0 + P.vy * t - 0.5 * P.g * t * t;
    out.z = P.z0 + P.vz * t;
    const aRef = lerpAngle(P.a0, P.aHit, e);
    out.x = shift * (aRef / (2 * Math.PI)) + off;
    // Nose first: the body pitches round toward where it will land, with a little tumble.
    out.a = lerpAngle(P.a0, P.aHit, smooth(e)) + Math.sin(Math.PI * e) * 0.6;
    out.air = true;
    return out;
  }
  // Landed: ride the rest of the loop down to the exit, with a decaying bounce.
  const e = (k - P.kHit) / (1 - P.kHit);
  const a = lerpAngle(P.aHit, 2 * Math.PI, e);
  loopPoint(f, (a / (2 * Math.PI)) * f.length, lat, pd);
  out.x = pd.x; out.y = pd.y; out.z = pd.z; out.a = a;
  const tl = (k - P.kHit) * P.T;
  out.bounce = 1.6 * Math.exp(-5 * tl) * Math.abs(Math.sin(tl * 11));
  out.y += pd.uy * out.bounce; out.z += pd.uz * out.bounce;
  return out;
}

/** The ride camera for a car that is on the track at `s` (no peel). */
function rideCam(f, s, lat, out) {
  const back = LOOP_CAM.back / LOOP_CAM.zScale;
  loopPoint(f, s - back, lat, pa);
  loopPoint(f, s - back * 0.5, lat, pb);
  // Sideways it tracks the car (the loop drifts across a road width), like the 2D camera.
  out.ex = loopPoint(f, s, lat, pc).x; out.ey = pa.y + pa.uy * LOOP_CAM.up; out.ez = pa.z + pa.uz * LOOP_CAM.up;
  out.a = pb.a;
}

const camA = {}, camB = {}, car = {};

/**
 * The chase camera for a car at `s`, `lat` half-widths across. Writes the eye (ex, ey, ez) and
 * the view's forward/up (fy, fz, uy, uz; right is +x). When the car peeled off at progress
 * `peelT` (too slow over the top) the camera keeps riding the track for a moment, so you see
 * the car fall away from it, then swings round to chase the falling car, levelling toward
 * world-up; once it lands it settles back behind the car. `fall` (0..1) is the sim's progress
 * from the peel to the exit (0 when riding normally) and `air` whether the car is flying.
 */
export function loopCamera(f, s, lat, peelT, out, ups = 1600) {
  out.fall = 0; out.air = false;
  if (peelT == null || s <= peelT * f.length || s >= f.length) {
    rideCam(f, s, lat, out);
  } else {
    const P = peelFall(f, peelT, ups);
    carPose(f, s, lat, peelT, ups, car);
    const k = car.k;
    out.fall = k; out.air = car.air;
    // A: still riding the track at the sim's progress (the car drops out of its frame).
    rideCam(f, s, lat, camA);
    // B: chasing the car, its angle easing from the loop's frame toward level (world-up).
    const aB = lerpAngle(P.a0, 2 * Math.PI, smooth(clamp01(k / P.kHit)));
    const back = LOOP_CAM.back * 2.6, up = LOOP_CAM.up * 2.2; // pulled back: you see the gap open up
    camB.a = aB;
    camB.ex = car.x;
    camB.ey = car.y - Math.sin(aB) * back + Math.cos(aB) * up;
    camB.ez = car.z - Math.cos(aB) * back - Math.sin(aB) * up;
    // Landed: the ride camera behind the car where it now is on the loop.
    let w, from = camA, to = camB;
    if (k < P.kHit) w = smooth(clamp01(k / (0.45 * P.kHit)));
    else {
      rideCam(f, (car.a / (2 * Math.PI)) * f.length, lat, camA);
      from = camB; to = camA;
      w = smooth(clamp01((k - P.kHit) / (0.5 * (1 - P.kHit))));
    }
    out.ex = from.ex + (to.ex - from.ex) * w;
    out.ey = from.ey + (to.ey - from.ey) * w;
    out.ez = from.ez + (to.ez - from.ez) * w;
    out.a = lerpAngle(from.a, to.a, w);
  }
  const a = out.a;
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

/**
 * How the approach view (drawLoopAhead) scales the loop it pins onto the 2D road's mouth.
 * The 2D road squashes distance: at the mouth its road is `kx0` times wider than the real
 * loop camera sees it, and drawing the whole loop at that scale made it loom far too big just
 * before you went in. So its height (`ky`) eases from the 2D scale far away to the real
 * camera's own scale by the time the ride view starts to blend in, growing all the way (never
 * shrinking as you close in). Across (`kx`) it leans toward the 2D road's width, but never
 * more than `stretch` times its height scale (more turns the loop's far side into a slab).
 * Through the blend the width and the anchor ease to the ride view too (`b`), so nothing pops.
 */
export const APPROACH = {
  span: 26000,  // starts at the edge of the 2D draw distance
  power: 2,
  stretch: 1.8, // most the width may be stretched past the height to sit on the 2D road
};
export function approachScale(f, sCar, kx0, out) {
  const fade = LOOP_CAM.fade;
  const u = Math.max(0, Math.min(1, (sCar + fade + APPROACH.span) / APPROACH.span));
  const e = Math.pow(u, APPROACH.power);
  const k0 = Math.max(1e-3, kx0);
  out.b = rideBlend(f, sCar);
  out.ky = Math.pow(k0, 1 - e);
  out.kx = Math.pow(Math.min(k0, out.ky * APPROACH.stretch), 1 - out.b);
  return out;
}

/** Screen row of the horizon and which side the sky is on (+1: above). Null if off-screen. */
export function horizonRow(c, H) {
  // A camera-space ray (X, Y, 1) is level when Y·uy + fy = 0.
  const fyc = LOOP_CAM.depth * H / 2;
  if (Math.abs(c.uy) < 1e-4) return { row: c.fy > 0 ? Infinity : -Infinity, skyUp: 1 };
  const Y = -c.fy / c.uy;
  return { row: H / 2 - fyc * Y, skyUp: c.uy > 0 ? 1 : -1 };
}
