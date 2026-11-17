import { describe, it, expect } from 'vitest';
import { careerStats, recordStats, statRows, milesText } from '../../src/career-stats.js';
import { recordRace, ensureGarage } from '../../src/cars.js';

describe('career stats (ticket 0278)', () => {
  it('a fresh or missing save reads as zeros', () => {
    const zero = { races: 0, wins: 0, warps: 0, bestChain: 0, distanceM: 0 };
    expect(careerStats({})).toEqual(zero);
    expect(careerStats(null)).toEqual(zero);
    expect(careerStats(undefined)).toEqual(zero);
    expect(careerStats({ career: null })).toEqual(zero);
  });

  it('an old save without the new fields keeps its counters and gets zeros for the rest', () => {
    // The shape careerDefaults() wrote before 0278: no bestChain, no distanceM.
    const old = { career: { races: 12, wins: 3, takedowns: 9, warps: 7, rivalsBeaten: 20, dailyStreak: 2, lastDailyDay: '2026-11-01' } };
    expect(careerStats(old)).toEqual({ races: 12, wins: 3, warps: 7, bestChain: 0, distanceM: 0 });
  });

  it('corrupt values never throw and show zero', () => {
    const bad = { career: { races: 'lots', wins: -4, warps: NaN, bestChain: Infinity, distanceM: { x: 1 } } };
    expect(careerStats(bad)).toEqual({ races: 0, wins: 0, warps: 0, bestChain: 0, distanceM: 0 });
    expect(careerStats({ career: 'oops' })).toEqual({ races: 0, wins: 0, warps: 0, bestChain: 0, distanceM: 0 });
    expect(careerStats({ career: { races: '5', wins: 2.7 } })).toMatchObject({ races: 5, wins: 2 });
  });

  it('a race end keeps the best chain and adds the distance', () => {
    const save = ensureGarage({});
    recordStats(save, { chain: 6, distance: 1200.4 });
    recordStats(save, { chain: 4, distance: 800 });
    expect(careerStats(save)).toMatchObject({ bestChain: 6, distanceM: 2000 });
    recordStats(save, { chain: 11, distance: -50 });
    expect(careerStats(save)).toMatchObject({ bestChain: 11, distanceM: 2000 });
  });

  it('repairs corrupt fields when it records instead of carrying NaN forward', () => {
    const save = { career: { bestChain: 'x', distanceM: null } };
    recordStats(save, { chain: 3, distance: 500 });
    expect(save.career.bestChain).toBe(3);
    expect(save.career.distanceM).toBe(500);
    const none = {};
    recordStats(none, { chain: undefined, distance: undefined });
    expect(careerStats(none)).toMatchObject({ bestChain: 0, distanceM: 0 });
  });

  it('works alongside recordRace: races, wins and warps come from the existing career counters', () => {
    const save = ensureGarage({});
    recordRace(save, { position: 1, takedowns: 0, warps: 2 });
    recordStats(save, { chain: 5, distance: 3000 });
    recordRace(save, { position: 3, takedowns: 1, warps: 1 });
    recordStats(save, { chain: 2, distance: 1000 });
    expect(careerStats(save)).toEqual({ races: 2, wins: 1, warps: 3, bestChain: 5, distanceM: 4000 });
  });

  it('survives a JSON round trip (what localStorage does)', () => {
    const save = ensureGarage({});
    recordRace(save, { position: 1, warps: 1 });
    recordStats(save, { chain: 4, distance: 1609.344 });
    const back = ensureGarage(JSON.parse(JSON.stringify(save)));
    expect(careerStats(back)).toEqual(careerStats(save));
  });

  it('distance reads in miles', () => {
    expect(milesText(0)).toBe('0.0 MI');
    expect(milesText(1609.344)).toBe('1.0 MI');
    expect(milesText(16093.44 * 1.234)).toBe('12.3 MI');
    expect(milesText(1609.344 * 1234.7)).toBe('1,235 MI');
  });

  it('the sheet rows are the five counters, labelled', () => {
    const rows = statRows({ career: { races: 1234, wins: 2, warps: 3, bestChain: 4, distanceM: 1609.344 } });
    expect(rows.map((r) => r[0])).toEqual(['RACES', 'WINS', 'WARPS', 'BEST CHAIN', 'DISTANCE']);
    expect(rows.map((r) => r[1])).toEqual(['1,234', '2', '3', '4', '1.0 MI']);
  });
});
