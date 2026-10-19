// Handling v4 (ticket 0181): a progressive tyre curve, weight transfer that follows the
// chassis, counter-steer that catches a slide, and surface grip.
import { describe, it, expect } from 'vitest';
import { LATERAL, TYRE, tyreCurve, handlingFor, createLateral, stepLateral } from '../../src/handling.js';

const DT = 1 / 120;
const base = { gripMult: 1, slipMult: 1, massKg: 1300 };
const sim = (steer, seconds, p, lt = createLateral(0)) => {
  const h = handlingFor(p.car || base);
  for (let i = 0; i < Math.round(seconds / DT); i++) stepLateral(lt, typeof steer === 'function' ? steer(i * DT) : steer, DT, { h, ...p });
  return lt;
};

describe('tyre curve (Pacejka-lite)', () => {
  it('is exactly linear well inside the limit', () => {
    for (const x of [0, 0.2, 0.5, TYRE.linear]) expect(tyreCurve(x)).toBeCloseTo(x, 12);
    expect(tyreCurve(-0.4)).toBeCloseTo(0.4, 12); // magnitude; the caller keeps the sign
  });
  it('rounds over smoothly to the peak instead of a hard ceiling', () => {
    expect(tyreCurve(1)).toBeGreaterThan(0.9);
    expect(tyreCurve(1)).toBeLessThan(1);
    let prev = 0, prevSlope = 1;
    for (let x = 0.01; x <= TYRE.fallFrom; x += 0.01) {
      const g = tyreCurve(x), slope = (g - prev) / 0.01;
      expect(g).toBeGreaterThan(prev);              // still gaining up to the peak …
      expect(slope).toBeLessThanOrEqual(prevSlope + 1e-6); // … ever more slowly (no kink back up)
      prev = g; prevSlope = slope;
    }
    expect(tyreCurve(TYRE.fallFrom)).toBeGreaterThan(0.99);
  });
  it('falls away past the peak to a slide level: overdriving gives less turn', () => {
    expect(tyreCurve(2)).toBeLessThan(tyreCurve(1.3));
    expect(tyreCurve(TYRE.fallTo)).toBeCloseTo((1 - TYRE.fall) * tyreCurve(TYRE.fallTo + 1) / (1 - TYRE.fall), 6);
    expect(tyreCurve(5)).toBeGreaterThan(1 - TYRE.fall - 0.01);
    expect(tyreCurve(5)).toBeLessThan(1 - TYRE.fall + 0.01);
  });
  it('slip shows up progressively as you approach the limit, never as a step', () => {
    // Sweep the wheel up through the limit at speed in a heavy car: slip rises from 0 smoothly.
    const car = { gripMult: 0.85, massKg: 2200 };
    let prev = 0;
    for (let st = 0.6; st <= 1.25; st += 0.05) {
      const lt = sim(st, 1.2, { speedMph: 150, car });
      expect(lt.slip).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(lt.slip - prev).toBeLessThan(0.08);
      prev = lt.slip;
    }
    expect(prev).toBeGreaterThan(0.2);
  });
  it('overdriven past the peak, more lock turns the car less: easing off gets the grip back', () => {
    const car = { gripMult: 0.85, massKg: 2200 };
    const over = sim(1.25, 1.2, { speedMph: 150, drifting: true, car });
    const eased = sim(0.8, 1.2, { speedMph: 150, drifting: true, car });
    expect(over.slip).toBeGreaterThan(eased.slip);
    expect(Math.abs(eased.r)).toBeGreaterThan(Math.abs(over.r));
  });
});

describe('weight transfer follows the chassis', () => {
  it('nose-down pitch sharpens turn-in and lets the tail step out; nose-up pushes', () => {
    const p = { speedMph: 90, curve: 1.2, use: 0.3 };
    const flat = sim(0.8, 0.8, { ...p, weight: 0 });
    const dive = sim(0.8, 0.8, { ...p, weight: 1, braking: true });
    const squat = sim(0.8, 0.8, { ...p, weight: -1, throttle: true });
    expect(Math.abs(dive.r)).toBeGreaterThan(Math.abs(flat.r));
    expect(dive.beta).toBeGreaterThan(flat.beta);
    expect(Math.abs(squat.r)).toBeLessThan(Math.abs(flat.r));
  });
  it('builds as the pitch builds: no pitch yet, no extra rotation yet', () => {
    const p = { speedMph: 90, curve: 1.2, use: 0.6, braking: true };
    const early = sim(0.8, 0.8, { ...p, weight: 0 });
    const old = sim(0.8, 0.8, { ...p });
    expect(Math.abs(early.r)).toBeLessThan(Math.abs(old.r)); // old model: instant with the pedal
  });
});

describe('counter-steer catches a slide', () => {
  it('opposite lock shrinks the tail-out angle instead of flinging it across', () => {
    const drift = sim(1, 1, { speedMph: 95, curve: 2.2, drifting: true });
    const tailOut = drift.yaw - drift.heading;
    expect(tailOut).toBeGreaterThan(0.15);
    // A quick catch: 0.15 s of opposite lock.
    const caught = sim(-0.5, 0.15, { speedMph: 95, curve: 2.2, drifting: true }, drift);
    const after = caught.yaw - caught.heading;
    expect(after).toBeLessThan(tailOut * 0.75);
    expect(after).toBeGreaterThan(-0.05); // caught, not flung the other way
  });
  it('a slide past grip (no handbrake drift) is caught the same way', () => {
    const p = { speedMph: 150, car: { gripMult: 0.85, slipMult: 1.1, massKg: 2200 } };
    const slide = sim(1.25, 1, p);
    expect(slide.slip).toBeGreaterThan(0.2);
    const before = slide.beta;
    const caught = sim(-0.6, 0.12, p, slide);
    expect(caught.beta).toBeLessThan(before);
  });
});

describe('surface grip', () => {
  it('a looser road slides earlier', () => {
    const dry = sim(1.25, 1.2, { speedMph: 120, curve: 1.8 });
    const dust = sim(1.25, 1.2, { speedMph: 120, curve: 1.8, surface: 0.9 });
    expect(dust.slip).toBeGreaterThan(dry.slip);
    expect(sim(1.25, 1.2, { speedMph: 120, curve: 1.8, surface: 1 })).toEqual(dry);
  });
  it('stays deterministic', () => {
    const go = () => sim((t) => Math.sin(t * 4) * 1.2, 3, { speedMph: 110, curve: 1.6, use: 0.4, weight: 0.3, surface: 0.92, drifting: true });
    expect(go()).toEqual(go());
  });
});
