// Ticket 0235: a pickup's halo (glow + white ring) stops growing at a cap and fades as it
// closes in, while the icon keeps its size.
import { describe, it, expect } from 'vitest';
import { haloCap, haloSize, haloRadius, haloAlpha, ringRadius, GLOW, RING, RING_HUG, CAP_PX } from '../../src/pickup-halo.js';

const VIEWS = [[1280, 720], [390, 844], [844, 390], [1920, 1080]];

describe('pickup halo cap (0235)', () => {
  it('is 64 px at 720p and scales with the short side', () => {
    expect(haloCap(1280, 720)).toBe(CAP_PX);
    expect(haloCap(390, 844)).toBeCloseTo(64 * 390 / 720, 6);
    expect(haloCap(1920, 1080)).toBeCloseTo(96, 6);
  });

  for (const [w, h] of VIEWS) {
    it(`never exceeds the cap at ${w}x${h}, however big the pickup`, () => {
      const cap = haloCap(w, h);
      for (let size = 4; size <= 2000; size *= 1.07) {
        expect(haloRadius(size, w, h)).toBeLessThanOrEqual(cap + 1e-9);
        expect(haloSize(size, w, h)).toBeLessThanOrEqual(size);
      }
      // A pickup as big as the one the scout saw (ring ~170 px across) is well past it.
      expect(haloRadius(170 / 0.56, w, h)).toBeCloseTo(Math.min(170 / 0.56 * GLOW, cap), 6);
    });
  }

  it('leaves a far (small) pickup exactly as before', () => {
    for (const size of [6, 20, 40, 54]) {
      expect(haloSize(size, 1280, 720)).toBe(size);
      expect(haloAlpha(size, 1280, 720)).toBe(1);
    }
  });

  it('fades monotonically to nothing as the pickup closes in', () => {
    let last = 1;
    for (let size = 4; size <= 400; size += 2) {
      const a = haloAlpha(size, 1280, 720);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(last + 1e-12);
      last = a;
    }
    expect(haloAlpha(64 / GLOW, 1280, 720)).toBe(1);   // full strength up to the cap…
    expect(haloAlpha(70 / GLOW, 1280, 720)).toBeLessThan(1); // …fading past it
    expect(haloAlpha(200, 1280, 720)).toBe(0);
  });

  for (const [w, h] of VIEWS) {
    it(`the ring stops at the cap, then only hugs the icon, at ${w}x${h}`, () => {
      const cap = haloCap(w, h);
      let last = 0;
      for (let size = 4; size <= 2000; size *= 1.03) {
        const r = ringRadius(size, w, h);
        // never past the cap, except as an outline about half the sprite's width…
        expect(r).toBeLessThanOrEqual(Math.max(cap, 0.5 * size) + 1e-9);
        // …never under the icon's body (so it never vanishes: the 0198 outline)…
        expect(r).toBeGreaterThanOrEqual(RING_HUG * size - 1e-9);
        // …and never bigger than before, never shrinking as the pickup closes in.
        expect(r).toBeLessThanOrEqual(RING * size + 1e-9);
        expect(r).toBeGreaterThanOrEqual(last - 1e-9);
        last = r;
      }
      // The scout's case: a ring ~170 px across on a ~300-unit coin is now an outline.
      expect(ringRadius(170 / 2 / RING, 1280, 720)).toBeCloseTo(Math.max(64, RING_HUG * 170 / 2 / RING), 6);
    });
  }
});
