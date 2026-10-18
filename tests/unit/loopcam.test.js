// The real loop (2D view): geometry and the chase camera that rides it (src/loopcam.js).
import { describe, it, expect } from 'vitest';
import { APPROACH, LOOP_CAM, loopPoint, loopCamera, loopRadius, loopExitShift, projectLoop, rideBlend, horizonRow, peelFall, carPose, approachScale } from '../../src/loopcam.js';
import { ROAD_CFG } from '../../src/data.js';
import { makeFeature, loopLength } from '../../src/setpieces.js';

const f = makeFeature('LOOP', 20000, Math.round(loopLength() / 200) * 200, { minMph: 40 });
const p = {}, c = {}, o = {};

describe('loop geometry', () => {
  it('climbs a vertical circle: level at the mouth, upside down at the top, level at the exit', () => {
    loopPoint(f, 0, 0, p);
    expect(p.y).toBeCloseTo(0); expect(p.uy).toBeCloseTo(1);
    loopPoint(f, f.length / 2, 0, p);
    expect(p.y).toBeCloseTo(2 * loopRadius(f), 5);
    expect(p.uy).toBeCloseTo(-1); // road's up points down: you're upside down
    expect(p.fz).toBeCloseTo(-1); // travelling back the way you came
    loopPoint(f, f.length, 0, p);
    expect(p.y).toBeCloseTo(0); expect(p.uy).toBeCloseTo(1);
  });

  it("the exit lane sits beside the entry, a road's width over, not 2πR further on", () => {
    loopPoint(f, f.length + 1000, 0, p);
    expect(p.x).toBeCloseTo(loopExitShift());
    expect(loopExitShift()).toBeGreaterThan(2 * LOOP_CAM.halfW);
    expect(p.z).toBeCloseTo(1000 * LOOP_CAM.zScale);
    loopPoint(f, -1000, 0.5, p);
    expect(p.x).toBeCloseTo(0.5 * LOOP_CAM.halfW);
    expect(p.z).toBeLessThan(0);
  });
});

describe('ride camera', () => {
  it('rides the frame: at the top of the loop the camera is upside down and the ground is overhead', () => {
    loopCamera(f, f.length / 2, 0, null, c);
    expect(c.uy).toBeLessThan(-0.95);
    const hz = horizonRow(c, 720);
    // Sky is on the "up" side of the horizon only when the camera is upright.
    expect(hz.skyUp).toBe(-1);
    loopCamera(f, -2000, 0, null, c);
    expect(c.uy).toBeCloseTo(1);
    expect(horizonRow(c, 720)).toEqual({ row: 360, skyUp: 1 });
  });

  it('keeps the car planted at the bottom of the screen all the way round', () => {
    for (const t of [-0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 1.05]) {
      const s = t * f.length;
      loopCamera(f, s, 0, null, c);
      loopPoint(f, s, 0, p);
      expect(projectLoop(c, p.x, p.y, p.z, 1280, 720, o), `t=${t}`).toBe(true);
      expect(o.sx, `t=${t}`).toBeCloseTo(640, 0);
      expect(o.sy / 720, `t=${t}`).toBeGreaterThan(0.7);
      expect(o.sy / 720, `t=${t}`).toBeLessThan(0.95);
    }
  });

  it('matches the 2D road framing on the run-in (same road width and car height on screen)', () => {
    loopCamera(f, -3000, 0, null, c);
    loopPoint(f, -3000, 1, p);
    projectLoop(c, p.x, p.y, p.z, 1280, 720, o);
    // 2D: half-width at the car = depth / playerZOffset · roadWidth · W/2 ≈ 0.757 W.
    expect((o.sx - 640) / 1280).toBeCloseTo(0.757, 2);
    expect(o.sy / 720).toBeCloseTo(0.816, 2);
  });

  it('peeling off drops you from the top back down onto the exit lane, upright', () => {
    loopCamera(f, 0.6 * f.length, 0, 0.4, c);
    expect(c.fall).toBeGreaterThan(0);
    loopCamera(f, f.length - 1, 0, 0.4, c);
    expect(c.fall).toBeCloseTo(1, 2);
    expect(c.uy).toBeCloseTo(1, 2);
  });

  it('blends in before the loop and out after it, fully on inside', () => {
    expect(rideBlend(f, -LOOP_CAM.fade - 1)).toBe(0);
    expect(rideBlend(f, -LOOP_CAM.fade / 2)).toBeCloseTo(0.5);
    expect(rideBlend(f, f.length / 3)).toBe(1);
    expect(rideBlend(f, f.length + LOOP_CAM.fade + 1)).toBe(0);
  });
});

describe('falling off the top', () => {
  const UPS = 1600; // 40 mph at the default pace
  const R = loopRadius(f);
  const car = {}, cam = {}, scr = {};
  const at = (k, peelT = 0.5) => peelT * f.length + k * (1 - peelT) * f.length;

  it('leaves the track on a real ballistic arc: tangent at the peel, constant gravity, then lands on the loop', () => {
    for (const peelT of [0.4, 0.5, 0.6]) {
      const P = peelFall(f, peelT, UPS);
      expect(P.g, `g ${peelT}`).toBeGreaterThan((UPS * LOOP_CAM.zScale) ** 2 / R); // it really can't hold on
      expect(P.kHit).toBeGreaterThan(0.15);
      expect(P.kHit).toBeLessThan(0.95);
      // Constant downward acceleration: equal second differences of height over equal steps.
      const ys = [0.1, 0.2, 0.3].map((k) => carPose(f, at(k * P.kHit, peelT), 0, peelT, UPS, car).y);
      const ys2 = [0.4, 0.5, 0.6].map((k) => carPose(f, at(k * P.kHit, peelT), 0, peelT, UPS, car).y);
      expect(ys[0] - 2 * ys[1] + ys[2]).toBeCloseTo(ys2[0] - 2 * ys2[1] + ys2[2], 6);
      expect(ys[0] - 2 * ys[1] + ys[2]).toBeLessThan(0);
      // Mid-fall it is well off the track: inside the loop, metres from the road.
      carPose(f, at(0.6 * P.kHit, peelT), 0, peelT, UPS, car);
      expect(car.air).toBe(true);
      const fromCentre = Math.hypot(car.y - R, car.z);
      // (Past the top it is already heading down the far side, so it skims closer.)
      expect(R - fromCentre, `clear of the road ${peelT}`).toBeGreaterThan(peelT < 0.55 ? 5 : 0.5);
      // Touchdown is on the track, and it rides out of the exit when the sim leaves the loop.
      carPose(f, at(P.kHit + 0.02, peelT), 0, peelT, UPS, car);
      expect(car.air).toBe(false);
      expect(Math.abs(Math.hypot(car.y - R, car.z) - R)).toBeLessThan(2.5);
      carPose(f, f.length - 1, 0, peelT, UPS, car);
      loopPoint(f, f.length, 0, p);
      expect(car.y).toBeCloseTo(p.y, 0); expect(car.z).toBeCloseTo(p.z, 0); expect(car.x).toBeCloseTo(p.x, 0);
    }
  });

  it('the camera keeps the falling car in shot and never jumps', () => {
    const peelT = 0.5;
    const P = peelFall(f, peelT, UPS);
    let prev = null;
    for (let k = 0.002; k < 1; k += 0.004) {
      const s = at(k, peelT);
      loopCamera(f, s, 0, peelT, cam, UPS);
      if (prev) {
        const jump = Math.hypot(cam.ex - prev.ex, cam.ey - prev.ey, cam.ez - prev.ez);
        expect(jump, `eye jump at k=${k.toFixed(3)}`).toBeLessThan(4);
        expect(Math.abs(cam.a - prev.a), `turn at k=${k.toFixed(3)}`).toBeLessThan(0.2);
      }
      prev = { ex: cam.ex, ey: cam.ey, ez: cam.ez, a: cam.a };
      if (k > 0.45 * P.kHit) {
        carPose(f, s, 0, peelT, UPS, car);
        expect(projectLoop(cam, car.x, car.y, car.z, 1280, 720, scr), `in front at k=${k.toFixed(3)}`).toBe(true);
        expect(scr.sx).toBeGreaterThan(0); expect(scr.sx).toBeLessThan(1280);
        expect(scr.sy).toBeGreaterThan(0); expect(scr.sy).toBeLessThan(720);
      }
    }
    // Starts on the ride camera and ends on it: no cut at either end.
    loopCamera(f, at(0.0001, peelT), 0, peelT, cam, UPS);
    const a = { ...cam };
    loopCamera(f, at(0, peelT) - 1, 0, null, cam);
    expect(Math.hypot(a.ex - cam.ex, a.ey - cam.ey, a.ez - cam.ez)).toBeLessThan(0.5);
    loopCamera(f, f.length - 1, 0, peelT, cam, UPS);
    const b = { ...cam };
    loopCamera(f, f.length + 1, 0, null, cam);
    expect(Math.hypot(b.ex - cam.ex, b.ey - cam.ey, b.ez - cam.ez)).toBeLessThan(0.5);
    expect(b.uy).toBeCloseTo(1, 2);
  });
});

describe('the loop on the approach', () => {
  const W = 1280, H = 720, sc = {}, cam = {}, m = {};
  // What drawLoopAhead does: the 2D road's half-width at the loop's mouth (kx0 = that ÷ the
  // real camera's), then the loop's height on screen at the scale approachScale picks.
  const measure = (sCar) => {
    loopCamera(f, sCar, 0, null, cam);
    const fx = LOOP_CAM.depth * W / 2;
    loopPoint(f, 0, 0, p);
    const cz0 = (p.y - cam.ey) * cam.fy + (p.z - cam.ez) * cam.fz;
    const bw = fx * LOOP_CAM.halfW / cz0;
    const w2d = fx * ROAD_CFG.roadWidth / (ROAD_CFG.playerZOffset - sCar);
    approachScale(f, sCar, w2d / bw, sc);
    // The real camera's own height of the loop: mouth to top.
    projectLoop(cam, p.x, p.y, p.z, W, H, m);
    const base = m.sy;
    loopPoint(f, f.length / 2, 0, p);
    projectLoop(cam, p.x, p.y, p.z, W, H, m);
    const natural = base - m.sy;
    return { natural, drawn: natural * sc.ky, kx: sc.kx, kx0: w2d / bw, b: sc.b };
  };

  it('matches the ride view’s own size when the ride view starts to blend in', () => {
    const r = measure(-LOOP_CAM.fade);
    expect(Math.abs(r.drawn / r.natural - 1)).toBeLessThan(0.1);
    expect(r.b).toBe(0);
    // Wider than it is tall-scaled, toward the 2D road it sits on, but never a flat slab.
    expect(r.kx).toBeGreaterThan(1);
    expect(r.kx).toBeLessThanOrEqual(APPROACH.stretch + 1e-9);
  });

  it('grows all the way in, and no longer looms several times too big just before the loop', () => {
    let prev = 0;
    for (let s = -27000; s <= -LOOP_CAM.fade; s += 50) {
      const r = measure(s);
      expect(r.drawn, `s=${s}`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = r.drawn;
    }
    const near = measure(-2000);
    expect(near.drawn / near.natural).toBeLessThan(1.5);
    expect(near.kx0).toBeGreaterThan(3); // the old uniform scale drew it this many times too big
  });

  it('eases width and placement onto the ride camera through the blend', () => {
    expect(measure(-LOOP_CAM.fade / 2).b).toBeCloseTo(0.5);
    const r = measure(-1);
    expect(r.kx).toBeCloseTo(1, 1);
  });
});
