import { describe, it, expect } from 'vitest';
import { NEAR, PROP, nearScale, propFade } from '../../src/near-fade.js';

// Near-camera props (ticket 0245): a hurdle, barrier or cone you have passed fades and shrinks on
// its way past the chase camera, so a lane-wide laser bar never stands at the screen edge as a
// solid navy slab. The fade is in world units: it starts once the prop's centre is behind your
// rear bumper, so a prop alongside your car is never faded.

const PLAYER_HALF_L = 105; // race-step playerHalfL
/** `past` for a prop whose centre is `dz` behind the player's centre. */
const pastOf = (dz) => dz - PLAYER_HALF_L;

describe('propFade', () => {
  it('uses the real player half-length', () => {
    expect(PROP.rear).toBe(PLAYER_HALF_L);
  });

  it('is 0 while the prop is ahead of you or alongside your car', () => {
    expect(propFade(pastOf(-400))).toBe(0); // ahead of you
    expect(propFade(pastOf(0))).toBe(0);    // level with you
    expect(propFade(pastOf(104))).toBe(0);  // centre still alongside your rear bumper
    expect(propFade(pastOf(105))).toBe(0);  // at it
    expect(propFade(NaN)).toBe(0);
  });

  it('eases monotonically to 1 over PROP.len once clear', () => {
    expect(propFade(PROP.len)).toBe(1);
    expect(propFade(PROP.len * 3)).toBe(1);
    let prev = 0;
    for (let p = -50; p <= PROP.len + 50; p += 1) {
      const t = propFade(p);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
    // Gentle at both ends (smoothstep), no pop at the start.
    expect(propFade(PROP.len * 0.05)).toBeLessThan(0.01);
    expect(propFade(PROP.len * 0.95)).toBeGreaterThan(0.99);
  });

  it('caps a fully faded prop, art spill included, at 8% of the view width', () => {
    expect(PROP.cover * PROP.spill).toBeLessThanOrEqual(0.08);
    // A lane-wide hurdle (halfW 0.21: 0.42 road widths) beside the camera covers ~half the view.
    const ow = 0.42 * 1.2;
    expect(ow * nearScale(ow, 1, PROP.cover) * PROP.spill).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(nearScale(ow, 0, PROP.cover)).toBe(1);     // not faded: drawn exactly as before
    expect(nearScale(0.05, 1, PROP.cover)).toBe(1);   // a cone already under the cap keeps its size
    const half = nearScale(ow, 0.5, PROP.cover);
    expect(half).toBeLessThan(1); expect(ow * half).toBeGreaterThan(PROP.cover);
  });

  it('leaves the car cap (0200) unchanged by default', () => {
    expect(0.8 * nearScale(0.8, 1)).toBeCloseTo(NEAR.cover, 6);
  });
});
