// Ticket 0188: the flash counter behind tests/e2e/flash-guard.spec.js, on synthetic frames.
import { describe, it, expect } from 'vitest';
import { flashRises } from '../e2e/helpers.js';

/** Frames every `dt` ms for `ms`; `layers(t)` gives each layer's level at time t. */
const frames = (ms, dt, layers) => {
  const out = [];
  for (let t = 0; t <= ms; t += dt) out.push({ t, canvas: 0, warpFlash: 0, abilityTintOverlay: 0, ...layers(t) });
  return out;
};

describe('flashRises', () => {
  it('counts a 6 Hz strobe as more than 3 a second, and a frame-locked strobe at a starved 7 fps', () => {
    const r = flashRises(frames(3000, 1000 / 60, (t) => ({ warpFlash: Math.floor(t / 83) % 2 ? 0 : 0.5 })));
    expect(r.perSecond).toBeGreaterThan(3);
    // On one frame, off the next, as the e2e drives it: every pulse is still seen.
    const slow = frames(3000, 1000 / 7, (t) => ({ warpFlash: Math.round(t * 7 / 1000) % 2 ? 0 : 0.5 }));
    expect(flashRises(slow).flashes).toBe(11);
  });

  it('a long tint does not hide flashes on another layer, and is not a flash itself', () => {
    const s = frames(5000, 1000 / 60, (t) => ({
      abilityTintOverlay: t > 200 && t < 4700 ? 0.1 : 0,
      canvas: [1000, 2100, 3200].some((b) => t >= b && t < b + 200) ? 0.28 : 0,
    }));
    const r = flashRises(s);
    expect(r.flashes).toBe(3);
    expect(r.perSecond).toBe(1);
  });

  it('layers that light together are one flash; four within a second fail the line', () => {
    const together = frames(1000, 1000 / 60, (t) => (t >= 100 && t < 400 ? { warpFlash: 0.14, canvas: 0.22 } : {}));
    expect(flashRises(together).flashes).toBe(1);
    const four = frames(1500, 1000 / 60, (t) => ({ canvas: [0, 250, 500, 750].some((b) => t >= b && t < b + 120) ? 0.3 : 0 }));
    expect(flashRises(four).perSecond).toBe(4);
  });

  it('nothing at or over the line is no flash', () => {
    const r = flashRises(frames(2000, 16, (t) => ({ canvas: t % 300 < 100 ? 0.07 : 0, abilityTintOverlay: 0.05 })));
    expect(r).toMatchObject({ flashes: 0, perSecond: 0 });
    expect(r.peak.canvas).toBeCloseTo(0.07);
  });
});
