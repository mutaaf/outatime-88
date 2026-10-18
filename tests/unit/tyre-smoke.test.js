import { describe, it, expect } from 'vitest';
import { tyreSmokeLevel, screechLevel, createScreechGate, createSmokePool, smokeRate } from '../../src/smoke.js';

const base = { status: 'PLAYING', speed: 60, playerY: 0, wheelSpin: 0, tyreSlip: 0, isDrifting: false, braking: false, wallGrind: false };

describe('tyre smoke level (ticket 0133)', () => {
  it('is zero when the tyres are gripping, airborne or not racing', () => {
    expect(tyreSmokeLevel(base)).toBe(0);
    expect(tyreSmokeLevel({ ...base, wheelSpin: 1, playerY: 30 })).toBe(0);
    expect(tyreSmokeLevel({ ...base, wheelSpin: 1, status: 'PAUSED' })).toBe(0);
  });
  it('rises with wheelspin, slides, drifts, lock-ups and wall grinding', () => {
    expect(tyreSmokeLevel({ ...base, wheelSpin: 0.3 })).toBeCloseTo(0.48);
    expect(tyreSmokeLevel({ ...base, wheelSpin: 2 })).toBe(1);
    expect(tyreSmokeLevel({ ...base, tyreSlip: 0.2 })).toBe(0);
    expect(tyreSmokeLevel({ ...base, tyreSlip: 0.6 })).toBeGreaterThan(0.4);
    expect(tyreSmokeLevel({ ...base, isDrifting: true })).toBeGreaterThanOrEqual(0.5);
    expect(tyreSmokeLevel({ ...base, braking: true, speed: 95 })).toBeGreaterThan(0);
    expect(tyreSmokeLevel({ ...base, wallGrind: true })).toBeCloseTo(0.55);
  });
  it('squeals on spin and slides but not on a wall grind (that scrubs)', () => {
    expect(screechLevel({ ...base, wallGrind: true })).toBe(0);
    expect(screechLevel({ ...base, wheelSpin: 0.5 })).toBeCloseTo(0.7);
    expect(screechLevel({ ...base, isDrifting: true, tyreSlip: 1 })).toBe(1);
    expect(screechLevel({ ...base, wheelSpin: 1, speed: 3 })).toBe(0);
  });
});

describe('squeal gate', () => {
  it('has hysteresis, so a level hovering at the threshold does not chatter', () => {
    const g = createScreechGate(0.16, 0.08);
    expect(g.step(0.12)).toBe(0);
    expect(g.step(0.2)).toBe(0.2);
    expect(g.step(0.12)).toBe(0.12); // still open above `off`
    expect(g.step(0.07)).toBe(0);
    expect(g.step(0.12)).toBe(0);    // closed until it passes `on` again
  });
});

describe('smoke pool', () => {
  it('is fixed size: spawning past capacity reuses slots instead of growing', () => {
    const pool = createSmokePool(8);
    const items = pool.items;
    for (let i = 0; i < 100; i++) pool.spawn(i, 0, 0, 0, 0, 0, 1, 1, 1);
    expect(pool.items).toBe(items);
    expect(pool.items.length).toBe(8);
    expect(pool.alive()).toBe(8);
  });
  it('puffs grow, rise, slow down and die', () => {
    const pool = createSmokePool(2);
    const p = pool.spawn(0, 0, 0, 10, 0, 0, 1, 2, 0.5);
    pool.update(0.1, 1.6, 3);
    expect(p.size).toBeCloseTo(1.2);
    expect(p.vy).toBeGreaterThan(0);
    expect(p.vx).toBeLessThan(10);
    for (let i = 0; i < 10; i++) pool.update(0.1);
    expect(pool.alive()).toBe(0);
  });
  it('emits fewer puffs on low graphics tiers and with reduced motion', () => {
    expect(smokeRate(0)).toBe(0);
    expect(smokeRate(1, 0.4)).toBeLessThan(smokeRate(1, 1));
    expect(smokeRate(1, 1, true)).toBeLessThan(smokeRate(1, 1));
  });
});
