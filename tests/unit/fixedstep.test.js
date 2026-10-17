import { describe, it, expect } from 'vitest';
import { createFixedStep, lerp } from '../../src/fixedstep.js';

// A toy car: speed builds with drag, position integrates speed. Explicit Euler, so a
// variable dt would give different answers at different frame rates; fixed steps must not.
function simulate(frameTimes) {
  const clock = createFixedStep({ hz: 120 });
  const car = { x: 0, v: 0 };
  let steps = 0;
  for (const ft of frameTimes) {
    const n = clock.advance(ft);
    for (let i = 0; i < n; i++) {
      car.v += (40 - 0.02 * car.v * car.v) * clock.step;
      car.x += car.v * clock.step;
      steps++;
    }
  }
  return { ...car, steps, alpha: clock.alpha };
}

const frames = (fps, seconds) => Array.from({ length: Math.round(fps * seconds) }, () => 1 / fps);

describe('fixed-timestep clock (ticket 0070)', () => {
  it('gives the same race at 30, 60 and 144 fps', () => {
    const a = simulate(frames(30, 10));
    const b = simulate(frames(60, 10));
    const c = simulate(frames(144, 10));
    expect(a.steps).toBe(1200);
    expect(b.steps).toBe(1200);
    // 144 fps doesn't divide 120 Hz evenly; at most one step can sit in the accumulator.
    expect(Math.abs(c.steps - 1200)).toBeLessThanOrEqual(1);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(Math.abs(c.x - a.x)).toBeLessThan(a.v / 120 + 1e-6);
  });

  it('jittery frames land on the same state as smooth ones', () => {
    const jitter = [];
    let t = 0;
    // 0.004..0.03 s frames, deterministic pattern, totalling exactly 6 s.
    for (let i = 0; t < 6 - 1e-9; i++) {
      const ft = Math.min(6 - t, 0.004 + ((i * 7919) % 27) / 1000);
      jitter.push(ft);
      t += ft;
    }
    const smooth = simulate(frames(60, 6));
    const rough = simulate(jitter);
    expect(Math.abs(rough.steps - smooth.steps)).toBeLessThanOrEqual(1);
    expect(Math.abs(rough.x - smooth.x)).toBeLessThan(smooth.v / 120 + 1e-6);
  });

  it('a 60 fps frame is exactly two steps (no float drift over a long race)', () => {
    const clock = createFixedStep({ hz: 120 });
    for (let i = 0; i < 60 * 60 * 5; i++) expect(clock.advance(1 / 60)).toBe(2);
  });

  it('caps a long stall so the sim never spirals (slow motion below 10 fps)', () => {
    const clock = createFixedStep({ hz: 120, maxFrame: 0.1 });
    expect(clock.advance(5)).toBe(12);
    expect(clock.advance(-1)).toBe(0);
    expect(clock.advance(NaN)).toBe(0);
  });

  it('alpha reports the fraction of a step waiting in the accumulator', () => {
    const clock = createFixedStep({ hz: 100 });
    expect(clock.advance(0.025)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5, 6);
    clock.reset();
    expect(clock.alpha).toBe(0);
  });

  it('lerp blends between two steps', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(10, 20, 1)).toBe(20);
  });
});
