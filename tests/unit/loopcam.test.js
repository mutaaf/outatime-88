// The real loop (2D view): geometry and the chase camera that rides it (src/loopcam.js).
import { describe, it, expect } from 'vitest';
import { LOOP_CAM, loopPoint, loopCamera, loopRadius, loopExitShift, projectLoop, rideBlend, horizonRow } from '../../src/loopcam.js';
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
