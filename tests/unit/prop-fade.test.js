import { describe, it, expect } from 'vitest';
import { NEAR, PROP, nearFade, nearScale, propFade } from '../../src/near-fade.js';

// Near-camera props (ticket 0245): a hurdle, barrier or cone passing beside the chase camera
// fades and shrinks at the same depth the cars beside it do (0200), so a lane-wide laser bar
// never stands at the screen edge as a solid navy slab.

describe('propFade', () => {
  it('fades at exactly the depth a car on the same segment does', () => {
    for (let share = 0; share <= 1.6; share += 0.01) expect(propFade(share)).toBe(nearFade(PROP.q * share));
  });

  it('is 0 ahead of and level with the player, 1 beside the camera, monotonic in between', () => {
    expect(propFade(0)).toBe(0);
    expect(propFade(0.5)).toBe(0);                    // well up the road: a threat to read, untouched
    expect(propFade(0.81)).toBe(0);                   // level with you (a car is ~0.26 of the view there)
    expect(propFade(NEAR.to / PROP.q)).toBe(1);
    expect(propFade(1.4)).toBe(1);                    // the near plane
    expect(propFade(NaN)).toBe(0);
    let prev = 0;
    for (let s = 0; s <= 1.6; s += 0.004) {
      const t = propFade(s);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });

  it('caps a fully faded prop, art spill included, at 8% of the view width', () => {
    expect(PROP.cover * PROP.spill).toBeLessThanOrEqual(0.08);
    // A lane-wide hurdle (halfW 0.21: 0.42 road widths) beside the camera covers ~half the view.
    const ow = 0.42 * 1.2;
    expect(ow * nearScale(ow, 1, PROP.cover) * PROP.spill).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(nearScale(ow, 0, PROP.cover)).toBe(1);     // ahead: drawn exactly as before
    expect(nearScale(0.05, 1, PROP.cover)).toBe(1);   // a cone already under the cap keeps its size
    const half = nearScale(ow, 0.5, PROP.cover);
    expect(half).toBeLessThan(1); expect(ow * half).toBeGreaterThan(PROP.cover);
  });

  it('leaves the car cap (0200) unchanged by default', () => {
    expect(0.8 * nearScale(0.8, 1)).toBeCloseTo(NEAR.cover, 6);
  });
});
