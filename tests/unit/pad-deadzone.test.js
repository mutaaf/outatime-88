// Ticket 0299: the stick DEADZONE choice (src/pad-deadzone.js) and the radius main's shapeAxis reads.
import { describe, it, expect, afterEach } from 'vitest';
import { DEADZONES, deadzoneName, deadzoneOf, stickReadout } from '../../src/pad-deadzone.js';
import { shapeAxis, setPadDead, PAD } from '../../src/input.js';

afterEach(() => setPadDead(PAD.dead));

describe('deadzone choice', () => {
  it('NORMAL is today\'s PAD.dead', () => {
    expect(DEADZONES.normal).toBe(PAD.dead);
    expect(DEADZONES.small).toBe(0.06);
    expect(DEADZONES.large).toBe(0.22);
  });
  it('unset, old saves and junk read as NORMAL', () => {
    for (const v of [undefined, null, '', 'huge', 0.2, 1, {}, [], 'toString', 'constructor', '__proto__']) {
      expect(deadzoneName(v)).toBe('normal');
      expect(deadzoneOf(v)).toBe(PAD.dead);
    }
    expect(deadzoneName('small')).toBe('small');
    expect(deadzoneOf('large')).toBe(0.22);
  });
  it('the readout says when the stick is inside the ring', () => {
    expect(stickReadout(0.2, 0, 0.22)).toMatch(/inside the deadzone/);
    expect(stickReadout(0.2, 0, 0.12)).toMatch(/steering\.$/);
    expect(stickReadout(1, 1, 0.12)).toBe('Stick at 100%: steering.');
  });
});

describe('shapeAxis at each radius', () => {
  it('default is bit-for-bit the old formula', () => {
    const old = (x) => { const m = Math.abs(x); return m <= 0.12 ? 0 : Math.sign(x) * Math.min(1, (m - 0.12) / (0.96 - 0.12)) ** 1.35; };
    for (let x = -1; x <= 1.0001; x += 0.01) expect(shapeAxis(x)).toBe(old(x));
  });
  it('LARGE: 0.20 steers 0; SMALL: 0.08 steers a little; NORMAL: 0.20 steers', () => {
    setPadDead(deadzoneOf('large'));
    expect(shapeAxis(0.2)).toBe(0);
    expect(shapeAxis(-0.2)).toBe(0);
    setPadDead(deadzoneOf('small'));
    expect(shapeAxis(0.08)).toBeGreaterThan(0);
    expect(shapeAxis(0.08)).toBeLessThan(0.05);
    setPadDead(deadzoneOf('normal'));
    expect(shapeAxis(0.08)).toBe(0);
    expect(shapeAxis(0.2)).toBeGreaterThan(0);
  });
  for (const name of Object.keys(DEADZONES)) {
    it(`${name}: 0 at the edge, full lock at the rim, monotonic past the radius`, () => {
      const d = deadzoneOf(name);
      setPadDead(d);
      expect(shapeAxis(0)).toBe(0);
      expect(shapeAxis(d)).toBe(0);
      expect(shapeAxis(d + 0.005)).toBeLessThan(0.01); // no jump out of the ring
      expect(shapeAxis(PAD.outer)).toBe(1);
      expect(shapeAxis(1)).toBe(1);
      expect(shapeAxis(-1)).toBe(-1);
      let prev = 0;
      for (let x = d; x <= 1.0001; x += 0.01) { const v = shapeAxis(x); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    });
  }
});
