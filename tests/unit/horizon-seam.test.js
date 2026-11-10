// Ticket 0256: the horizon seam sprite fades the ground's colour in over the roofline's base and
// back out, with no row jumping: zero at its top edge, full at the horizon, near zero at its foot.
import { describe, it, expect } from 'vitest';
import { seamAlpha } from '../../src/scenes/kit.js';

describe('horizon seam alpha (0256)', () => {
  for (const [up, down] of [[16, 4], [25, 7], [30, 8]]) {
    it(`${up} rows up, ${down} down: soft at both edges, full at the horizon, no big step`, () => {
      const a = seamAlpha(up, down);
      expect(a.length).toBe(up + down);
      expect(a[0]).toBeLessThan(0.05); // fades to nothing at its top edge
      expect(a[up - 1]).toBe(1); // the row just above the horizon is the ground colour
      expect(a[up + down - 1]).toBeLessThan(0.3); // and it eases back out under it
      let maxStep = 0;
      for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
      // a 45-level roofline/ground contrast moves ≤ 6 levels a row above the horizon
      for (let i = 1; i < up; i++) expect(Math.abs(a[i] - a[i - 1]) * 45).toBeLessThanOrEqual(6);
      expect(maxStep).toBeLessThan(0.5);
      for (const v of a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    });
  }
});
