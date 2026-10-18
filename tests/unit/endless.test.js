// Endless Highway progression (ticket 0150): tiers, the difficulty contract, tuning, bests.
import { describe, it, expect } from 'vitest';
import { ENDLESS, tierStart, tierFor, tierProgress, endlessDifficulty, difficultyOf, endlessTuning, recordEndless } from '../../src/endless.js';

describe('endless tiers', () => {
  it('start at tier 1 and each tier is longer than the last', () => {
    expect(tierFor(0)).toBe(1);
    expect(tierStart(1)).toBe(0);
    expect(tierStart(2)).toBe(ENDLESS.firstTier);
    for (let n = 2; n < 40; n++) expect(tierStart(n + 1) - tierStart(n)).toBeGreaterThan(tierStart(n) - tierStart(n - 1));
  });

  it('tierFor is exact at every boundary and never goes backwards', () => {
    for (let n = 1; n < 60; n++) {
      expect(tierFor(tierStart(n))).toBe(n);
      expect(tierFor(tierStart(n) - 0.01)).toBe(Math.max(1, n - 1));
    }
    let prev = 1;
    for (let d = 0; d < 400000; d += 137) { const t = tierFor(d); expect(t).toBeGreaterThanOrEqual(prev); prev = t; }
  });

  it('reports progress through the tier', () => {
    const mid = (tierStart(3) + tierStart(4)) / 2;
    const p = tierProgress(mid);
    expect(p.tier).toBe(3);
    expect(p.frac).toBeCloseTo(0.5, 5);
    expect(p.toNext).toBeCloseTo(tierStart(4) - mid, 5);
  });
});

describe('difficulty contract', () => {
  it('endless difficulty is 0 at the start, smooth, monotonic and below 1', () => {
    expect(endlessDifficulty(0)).toBe(0);
    let prev = -1;
    for (let d = 0; d < 300000; d += 50) {
      const k = endlessDifficulty(d);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k - Math.max(0, prev)).toBeLessThan(0.01); // no jumps at tier boundaries
      expect(k).toBeLessThan(1);
      prev = k;
    }
    expect(endlessDifficulty(tierStart(5))).toBeCloseTo(1 - Math.exp(-4 / ENDLESS.ramp), 6);
    expect(endlessDifficulty(tierStart(10))).toBeCloseTo(1 - Math.exp(-9 / ENDLESS.ramp), 6);
  });

  it('track races: level base plus race progress; live: base only', () => {
    const out = {};
    const a = difficultyOf({ mode: 'ARCADE', distance: 0, levelIndex: 0, levels: 5, raceLength: 5200 }, out);
    expect(a).toBe(out);
    expect(a.tier).toBe(1);
    expect(a.difficulty).toBeCloseTo(0.15);
    expect(difficultyOf({ mode: 'ARCADE', distance: 5200, levelIndex: 4, levels: 5, raceLength: 5200 }).difficulty).toBeCloseTo(0.95);
    expect(difficultyOf({ mode: 'LIVE', distance: 99999, levelIndex: 2, levels: 5, raceLength: 6000 }).difficulty).toBeCloseTo(0.45);
    const e = difficultyOf({ mode: 'INFINITE', distance: tierStart(4) + 1, levelIndex: 3, levels: 5 });
    expect(e.tier).toBe(4);
  });
});

describe('endless tuning', () => {
  it('maps difficulty onto the wave scale, curve intensity and a capped coin multiplier', () => {
    const lo = endlessTuning(0, 1);
    expect(lo).toMatchObject({ wave: 1, intensity: 1, coinMult: 1 });
    const hi = endlessTuning(1, 50);
    expect(hi.wave).toBe(ENDLESS.maxWave);
    expect(hi.intensity).toBeCloseTo(1 + ENDLESS.intensity);
    expect(hi.coinMult).toBe(ENDLESS.coinMax);
    expect(endlessTuning(0.4, 3).coinMult).toBeCloseTo(1.4);
  });
});

describe('endless bests', () => {
  it('keeps the best distance and tier across runs', () => {
    const save = {};
    expect(recordEndless(save, 4000.6, 2)).toEqual({ best: 4001, bestTier: 2, isBest: true });
    expect(recordEndless(save, 3000, 3)).toEqual({ best: 4001, bestTier: 3, isBest: false });
    expect(save.endless.runs).toBe(2);
  });
});
