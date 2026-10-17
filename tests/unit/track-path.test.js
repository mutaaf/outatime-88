import { describe, it, expect } from 'vitest';
import { createTrackPath, TURN_PER_CURVE } from '../../src/render3d/path.js';
import { ROAD_CFG } from '../../src/data.js';
import { track, buildInitialTrack, generateNextTrackBiome } from '../../src/track.js';

const seg = (curve, y1 = 0, y2 = 0) => ({ curve, p1: { world: { y: y1 } }, p2: { world: { y: y2 } } });
const L = ROAD_CFG.segLength;

describe('3D track path', () => {
  it('a straight track runs straight down +Z, track Z for track Z', () => {
    const p = createTrackPath();
    p.sync([seg(0), seg(0), seg(0)]);
    const o = p.at(L * 1.5, 0, {});
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.z).toBeCloseTo(L * 1.5, 9);
    expect(o.heading).toBe(0);
  });

  it('a positive curve (drawn to the right in 2D) turns right in 3D', () => {
    const p = createTrackPath();
    p.sync(Array.from({ length: 60 }, () => seg(1)));
    const o = p.at(L * 59, 0, {});
    expect(o.x).toBeGreaterThan(0);
    expect(o.heading).toBeCloseTo(58.5 * TURN_PER_CURVE * 1, 1);
  });

  it('a positive offset sits to the right of the road, one road half-width per unit', () => {
    const p = createTrackPath();
    p.sync([seg(0), seg(0)]);
    const c = p.at(L, 0, {});
    const r = p.at(L, 1, {});
    expect(r.x - c.x).toBeCloseTo(ROAD_CFG.roadWidth, 6);
    expect(r.z).toBeCloseTo(c.z, 6);
  });

  it('follows the segment heights', () => {
    const p = createTrackPath();
    p.sync([seg(0, 0, 100), seg(0, 100, 100)]);
    expect(p.at(L * 0.5, 0, {}).y).toBeCloseTo(50, 9);
  });

  it('extending as the track grows matches building it in one go', () => {
    buildInitialTrack();
    const inc = createTrackPath();
    inc.sync(track.segments);
    for (let k = 0; k < 5; k++) { generateNextTrackBiome(); inc.sync(track.segments); }
    const full = createTrackPath();
    full.sync(track.segments.slice());
    for (let z = 0; z < track.segments.length * L; z += 997) {
      const a = inc.at(z, 0.4, {}), b = full.at(z, 0.4, {});
      expect(a.x).toBeCloseTo(b.x, 6); expect(a.z).toBeCloseTo(b.z, 6); expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('rebuilds when a new race replaces the segment list, and clamps outside the track', () => {
    const p = createTrackPath();
    p.sync(Array.from({ length: 30 }, () => seg(2)));
    const fresh = [seg(0), seg(0)];
    p.sync(fresh);
    expect(p.count).toBe(2);
    expect(p.at(L * 99, 0, {}).z).toBeCloseTo(L * 2, 6);
    expect(p.at(-500, 0, {}).z).toBeCloseTo(0, 6);
  });

  it('does not allocate: writes into the object it is given', () => {
    const p = createTrackPath();
    p.sync([seg(0)]);
    const out = {};
    expect(p.at(10, 0, out)).toBe(out);
  });
});

describe('3D track path scales', () => {
  it('stretches depth, narrows the road, and keeps bends the same number of road widths', () => {
    const segs = Array.from({ length: 120 }, () => ({ curve: 1, p1: { world: { y: 10 } }, p2: { world: { y: 10 } } }));
    const unit = createTrackPath();
    const scaled = createTrackPath({ zScale: 3, xScale: 0.5, yScale: 2 });
    unit.sync(segs); scaled.sync(segs);
    const z = ROAD_CFG.segLength * 100;
    const a = unit.at(z, 0, {}), b = scaled.at(z, 0, {});
    // Sideways drift measured in road half-widths matches (small-angle bends).
    expect(b.x / (ROAD_CFG.roadWidth * 0.5)).toBeCloseTo(a.x / ROAD_CFG.roadWidth, 1);
    const next = scaled.at(z + ROAD_CFG.segLength, 0, {});
    expect(Math.hypot(next.x - b.x, next.z - b.z)).toBeCloseTo(ROAD_CFG.segLength * 3, 6);
    expect(b.y).toBe(20);
    expect(scaled.at(z, 1, {}).x - b.x).toBeCloseTo(ROAD_CFG.roadWidth * 0.5 * Math.cos(b.heading), 6);
  });
});
