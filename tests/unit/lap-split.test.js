import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bestLapsFor, lapCall, foldBest, splitText, lapCounts } from '../../src/lap-split.js';

describe('lap split versus your best (ticket 0286)', () => {
  it('a save with no bestLaps, or junk in it, reads as no best for any lap', () => {
    expect(bestLapsFor({}, '0')).toEqual([]);
    expect(bestLapsFor(null, '0')).toEqual([]);
    expect(bestLapsFor({ bestLaps: 'oops' }, '0')).toEqual([]);
    expect(bestLapsFor({ bestLaps: { 0: 'x' } }, '0')).toEqual([]);
    expect(bestLapsFor({ bestLaps: { 0: [NaN, -3, 0, Infinity, '12', 31.5] } }, '0')).toEqual([null, null, null, null, null, 31.5]);
    expect(bestLapsFor({ bestLaps: { 1: [40] } }, '0')).toEqual([]);
  });

  it('the first lap on a level with no saved best shows no delta', () => {
    expect(lapCall(1, 41.2, undefined)).toBeNull();
    expect(lapCall(1, 41.2, null)).toBeNull();
  });

  it('a faster lap reads as a gain with a minus sign and a down glyph', () => {
    const c = lapCall(1, 40.78, 41.2);
    expect(c.kind).toBe('gain');
    expect(c.main).toBe('LAP 1 ▼ -0.42');
    expect(c.sub).toBe('FASTER THAN YOUR BEST 41.20');
  });

  it('a slower lap reads as a loss with a plus sign and an up glyph', () => {
    const c = lapCall(2, 39.21, 38.9);
    expect(c.kind).toBe('loss');
    expect(c.main).toBe('LAP 2 ▲ +0.31');
    expect(c.sub).toBe('SLOWER THAN YOUR BEST 38.90');
  });

  it('a lap that matches your best to the hundredth is level, never a gain or a loss', () => {
    const c = lapCall(2, 38.902, 38.9);
    expect(c.kind).toBe('even');
    expect(c.main).toBe('LAP 2 = 0.00');
    expect(c.sub).toBe('LEVEL WITH YOUR BEST 38.90');
  });

  it('the sign carries the meaning, never the colour alone', () => {
    for (const [lap, best] of [[30, 31], [31, 30], [30, 30]]) {
      expect(lapCall(1, lap, best).main).toMatch(/[▼▲=] [-+]?\d+\.\d\d$/);
    }
  });

  it('formats long deltas and best laps over a minute', () => {
    expect(splitText(-12.346)).toBe('-12.35');
    expect(splitText(0.004)).toBe('0.00');
    expect(splitText(-0.004)).toBe('0.00'); // never "-0.00"
    expect(splitText(0.006)).toBe('+0.01');
    expect(splitText(-0.006)).toBe('-0.01');
    expect(lapCall(3, 75.5, 62.25).sub).toBe('SLOWER THAN YOUR BEST 1:02.25');
  });

  it('folds a finished race into the best of each lap', () => {
    expect(foldBest([], [42, 39.5, 40])).toEqual([42, 39.5, 40]);
    expect(foldBest([41, 40, null], [42, 39.5, 40])).toEqual([41, 39.5, 40]);
    expect(foldBest([41, 40, 39], [42, NaN, 0])).toEqual([41, 40, 39]);
  });

  it('counts only solo campaign races: not live, endless, daily or TV', () => {
    expect(lapCounts({ mode: 'ARCADE', daily: null }, false)).toBe(true);
    expect(lapCounts({ mode: 'LIVE', daily: null }, false)).toBe(false);
    expect(lapCounts({ mode: 'INFINITE', daily: null }, false)).toBe(false);
    expect(lapCounts({ mode: 'ARCADE', daily: { day: '2026-11-19' } }, false)).toBe(false);
    expect(lapCounts({ mode: 'ARCADE', daily: null }, true)).toBe(false);
  });
});

describe('bestLaps in the save (invariant 6)', () => {
  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
  let storage;
  beforeEach(() => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('an old save without bestLaps loads cleanly and has no best', async () => {
    // The shape a save had before 0286: no bestLaps anywhere.
    storage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      bestScore: 120000, fluxCoins: 900, unlockedLevel: 3, progress: { 0: { medal: 'gold', bestTime: 118.2 } },
      selectedLevel: 2, upgrades: { engine: 2, tires: 1, flux: 1, hover: 1 }, onboarded: true, lineupsSeen: ['ARCADE:0:'],
    }));
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    expect(SaveStore.data.bestScore).toBe(120000);
    expect(SaveStore.data.bestLaps).toEqual({}); // the default fills in
    expect(bestLapsFor(SaveStore.data, '0')).toEqual([]);
  });

  it('bestLaps survives a reload', async () => {
    const { SaveStore } = await import('../../src/save.js');
    SaveStore.load();
    SaveStore.data.bestLaps = { 2: foldBest(bestLapsFor(SaveStore.data, '2'), [44.1, 40.2, 40.9]) };
    SaveStore.save();
    vi.resetModules();
    const { SaveStore: fresh } = await import('../../src/save.js');
    fresh.load();
    expect(bestLapsFor(fresh.data, '2')).toEqual([44.1, 40.2, 40.9]);
    expect(lapCall(2, 40, bestLapsFor(fresh.data, '2')[1]).main).toBe('LAP 2 ▼ -0.20');
  });
});
