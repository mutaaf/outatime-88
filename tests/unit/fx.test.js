import { describe, it, expect } from 'vitest';
import { speedFeel, createParticlePool, createHitStop, nearMissChain } from '../../src/fx.js';

describe('speedFeel (ticket 0009)', () => {
  it('is zero below 40 mph and full at 88+', () => {
    expect(speedFeel(0, false)).toEqual({ lines: 0, fov: 1, shake: 0, aberration: 0 });
    expect(speedFeel(39, false).lines).toBe(0);
    const top = speedFeel(88, false);
    expect(top.lines).toBe(1);
    expect(speedFeel(140, false)).toEqual(top);
  });

  it('is monotonic in speed', () => {
    let prev = speedFeel(0, false);
    for (let v = 1; v <= 120; v++) {
      const cur = speedFeel(v, false);
      for (const k of ['lines', 'fov', 'shake']) expect(cur[k]).toBeGreaterThanOrEqual(prev[k]);
      prev = cur;
    }
  });

  it('reduced motion removes shake, lines and aberration (FOV stays put)', () => {
    expect(speedFeel(120, true)).toEqual({ lines: 0, fov: 1, shake: 0, aberration: 0 });
  });

  it('returns the same object every call (no per-frame allocation)', () => {
    expect(speedFeel(50, false)).toBe(speedFeel(90, false));
  });
});

describe('particle pool', () => {
  it('never grows past capacity and recycles dead particles', () => {
    const pool = createParticlePool(64);
    for (let i = 0; i < 500; i++) pool.spawn(0, 0, 1, 1, 0.5, 0);
    expect(pool.alive()).toBeLessThanOrEqual(64);
    expect(pool.items.length).toBe(64);
    pool.update(1); // everyone dies
    expect(pool.alive()).toBe(0);
    pool.spawn(0, 0, 0, 0, 1, 0);
    expect(pool.alive()).toBe(1);
    expect(pool.items.length).toBe(64);
  });

  it('integrates motion with gravity', () => {
    const pool = createParticlePool(4);
    pool.spawn(0, 0, 10, 0, 2, 0);
    pool.update(0.5);
    const p = pool.items.find((q) => q.life > 0);
    expect(p.x).toBeCloseTo(5, 5);
    expect(p.y).toBeGreaterThan(0);
  });
});

describe('hit-stop', () => {
  it('freezes time briefly then releases', () => {
    const hs = createHitStop();
    expect(hs.scale(0.016)).toBe(1);
    hs.trigger(0.08);
    expect(hs.scale(0.016)).toBeLessThan(0.2);
    for (let i = 0; i < 10; i++) hs.scale(0.016);
    expect(hs.scale(0.016)).toBe(1);
  });

  it('reduced motion skips the freeze', () => {
    const hs = createHitStop();
    hs.trigger(0.08, true);
    expect(hs.scale(0.016)).toBe(1);
  });
});

describe('near-miss chain', () => {
  it('multiplier grows with consecutive near-misses and resets after a gap', () => {
    const c = nearMissChain();
    expect(c.hit(0)).toBe(1);
    expect(c.hit(0.5)).toBe(2);
    expect(c.hit(1.0)).toBe(3);
    expect(c.points(1.0)).toBe(250 * 3);
    expect(c.hit(10)).toBe(1); // too long since the last one
  });
});
