// Ticket 0235: a pickup's halo (glow + white ring) stops growing at a cap and fades as it
// closes in, while the icon keeps its size.
import { describe, it, expect } from 'vitest';
import { haloCap, haloSize, haloRadius, haloAlpha, GLOW, CAP_PX } from '../../src/pickup-halo.js';

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
    expect(haloAlpha(64 / GLOW, 1280, 720)).toBeLessThan(1);  // at the cap it's already fading
    expect(haloAlpha(200, 1280, 720)).toBe(0);
  });

  it('has no clock: the same size always gives the same halo (calm motion needs no branch)', () => {
    expect(haloAlpha.length).toBe(3);
    expect(haloSize.length).toBe(3);
    expect(haloAlpha(90, 1280, 720)).toBe(haloAlpha(90, 1280, 720));
  });
});
