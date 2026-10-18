import { describe, it, expect } from 'vitest';
import {
  CAR_SPECS, STATS, STAT_BUDGET, STARTER_CAR, carParams, displayStats, ensureGarage, unlockProgress,
  grantEarnedCars, buyCar, recordRace, noteRivalBeaten, isOwned,
} from '../../src/cars.js';
import { POP_CULTURE_ROSTER } from '../../src/data.js';

const freshSave = (extra = {}) => ensureGarage({ fluxCoins: 250, progress: {}, ...extra });
const byId = (id) => POP_CULTURE_ROSTER.find((c) => c.id === id);

describe('car roster (ticket 0071)', () => {
  it('every roster car has specs and every spec has a roster car', () => {
    expect(Object.keys(CAR_SPECS).sort()).toEqual(POP_CULTURE_ROSTER.map((c) => c.id).sort());
  });

  it('every car spends the same rating budget, each rating 1..10', () => {
    for (const [id, spec] of Object.entries(CAR_SPECS)) {
      const sum = STATS.reduce((t, k) => t + spec.stats[k], 0);
      expect(sum, id).toBe(STAT_BUDGET);
      for (const k of STATS) expect(spec.stats[k], `${id}.${k}`).toBeGreaterThanOrEqual(1);
      for (const k of STATS) expect(spec.stats[k], `${id}.${k}`).toBeLessThanOrEqual(10);
    }
  });

  it('no car strictly dominates another, in ratings or in the physics they drive', () => {
    const ids = Object.keys(CAR_SPECS);
    // Higher is better for every one of these sim numbers except damageMult.
    const simScore = (id) => {
      const p = carParams(byId(id));
      return [p.topMphBonus, p.accelMult, p.gripMult, p.fluxMult, p.maxHp, -p.damageMult];
    };
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const ra = STATS.map((k) => CAR_SPECS[a].stats[k]);
      const rb = STATS.map((k) => CAR_SPECS[b].stats[k]);
      const dominates = (x, y) => x.every((v, i) => v >= y[i]) && x.some((v, i) => v > y[i]);
      expect(dominates(ra, rb), `${a} dominates ${b}`).toBe(false);
      expect(dominates(simScore(a), simScore(b)), `${a} sim-dominates ${b}`).toBe(false);
    }
  });

  it('cars feel distinct: top speed, grip and durability spread meaningfully', () => {
    const ps = Object.keys(CAR_SPECS).map((id) => carParams(byId(id)));
    const spread = (f) => Math.max(...ps.map(f)) - Math.min(...ps.map(f));
    expect(spread((p) => p.topMphBonus)).toBeGreaterThanOrEqual(10); // mph
    expect(spread((p) => p.gripMult)).toBeGreaterThanOrEqual(0.15);
    expect(spread((p) => p.maxHp)).toBeGreaterThanOrEqual(50);
    expect(spread((p) => p.massKg)).toBeGreaterThanOrEqual(1000);
  });

  it('every rating point is felt: a 9 and a 4 drive like different cars', () => {
    const at = (stats) => {
      CAR_SPECS.__T = { stats, unlock: { type: 'starter' } };
      const p = carParams({ id: '__T' });
      delete CAR_SPECS.__T;
      return p;
    };
    const base = { speed: 5, accel: 5, grip: 5, flux: 5, armor: 5 };
    const hi = at({ ...base, speed: 9, accel: 9, grip: 9, armor: 9 });
    const lo = at({ ...base, speed: 4, accel: 4, grip: 4, armor: 4 });
    expect(hi.topMphBonus - lo.topMphBonus).toBeGreaterThanOrEqual(18); // mph at the top end
    expect(hi.accelMult / lo.accelMult).toBeGreaterThanOrEqual(1.4);    // launch
    expect(hi.gripMult / lo.gripMult).toBeGreaterThanOrEqual(1.3);      // cornering
    expect(lo.slipMult).toBeGreaterThan(hi.slipMult);                   // looser tail
    expect(lo.damageMult / hi.damageMult).toBeGreaterThanOrEqual(1.5);  // hits hurt more
  });

  it('balance: every roster car stays inside the sane range the race and server allow', () => {
    for (const id of Object.keys(CAR_SPECS)) {
      const p = carParams(byId(id));
      expect(92 + p.topMphBonus, id).toBeGreaterThanOrEqual(92);   // keeps up with the clean line
      expect(128 + p.topMphBonus, id).toBeLessThanOrEqual(150);     // warp ceiling (worker: 300/s)
      expect(p.accelMult, id).toBeGreaterThan(0.6);
      expect(p.gripMult, id).toBeGreaterThan(0.8);
      expect(p.slipMult, id).toBeGreaterThan(0.5);
      expect(p.damageMult, id).toBeGreaterThan(0.5);
    }
  });

  it('a neutral rating of 5 is the old baseline', () => {
    const p = carParams({ id: 'X' }); // unknown car → starter, but check the formula at 5
    expect(p).toBeTruthy();
    const five = { speed: 5, accel: 5, grip: 5, flux: 5, armor: 5 };
    CAR_SPECS.__TEST = { stats: five, unlock: { type: 'starter' } };
    const n = carParams({ id: '__TEST', massKg: 1400 });
    delete CAR_SPECS.__TEST;
    expect(n.topMphBonus).toBe(6);
    expect(n.accelMult).toBeCloseTo(1, 9);
    expect(n.gripMult).toBeCloseTo(1, 9);
    expect(n.fluxMult).toBeCloseTo(1, 9);
    expect(n.damageMult).toBeCloseTo(1, 9);
    expect(n.massKg).toBe(1400);
  });

  it('roster maxHp matches the durability rating', () => {
    for (const c of POP_CULTURE_ROSTER) expect(c.maxHp, c.id).toBe(carParams(c).maxHp);
  });

  it('displayed ratings grow with upgrades but never pass 10', () => {
    const base = displayStats('GRID_CYCLE');
    const maxed = displayStats('GRID_CYCLE', { engine: 5, tires: 5, flux: 5, hover: 5 });
    for (const k of STATS) expect(maxed[k]).toBeGreaterThanOrEqual(base[k]);
    for (const k of STATS) expect(maxed[k]).toBeLessThanOrEqual(10);
  });
});

describe('unlocks (ticket 0071)', () => {
  it('a new player owns the two starters and drives the starter', () => {
    const s = freshSave();
    expect(s.garage.owned).toEqual(['FLUX_COUPE_88', 'PASS_RUNNER_86']);
    expect(s.garage.selected).toBe(STARTER_CAR);
    expect(Object.values(CAR_SPECS).filter((c) => c.unlock.type === 'starter')).toHaveLength(2);
  });

  it('every locked car says how to unlock it', () => {
    const s = freshSave();
    for (const id of Object.keys(CAR_SPECS)) {
      if (isOwned(s, id)) continue;
      expect(unlockProgress(s, id).text, id).toMatch(/[A-Z]{3,}/);
    }
  });

  it('coin cars are bought, not granted, and cost what they say', () => {
    const s = freshSave({ fluxCoins: 400 });
    expect(grantEarnedCars(s)).toEqual([]);
    expect(buyCar(s, 'BULLDOG_VAN')).toBe(false); // 500
    s.fluxCoins = 520;
    expect(unlockProgress(s, 'BULLDOG_VAN').buyable).toBe(true);
    expect(buyCar(s, 'BULLDOG_VAN')).toBe(true);
    expect(s.fluxCoins).toBe(20);
    expect(buyCar(s, 'BULLDOG_VAN')).toBe(false); // already owned
    expect(buyCar(s, 'BLUE_KESTREL')).toBe(false); // milestone car, not for sale
  });

  it('wins, takedowns and rivals accumulate across races and grant their cars', () => {
    const s = freshSave();
    expect(recordRace(s, { position: 1, takedowns: 6, warps: 1, rivalsBeaten: 2 })).toEqual([]);
    expect(recordRace(s, { position: 1, takedowns: 6, warps: 0, rivalsBeaten: 2 })).toEqual([]);
    const third = recordRace(s, { position: 1, takedowns: 4, warps: 2, rivalsBeaten: 5 });
    expect(third.sort()).toEqual(['GO_ROCKET_5', 'IRON_SAINT_BRAWLER']);
    expect(s.career).toMatchObject({ races: 3, wins: 3, takedowns: 16, warps: 3, rivalsBeaten: 9 });
    expect(recordRace(s, { position: 2, takedowns: 0, warps: 0, rivalsBeaten: 4 })).toEqual([]);
    // A six-car field: every rival you finish ahead of counts toward the rival car (20).
    expect(recordRace(s, { position: 1, takedowns: 0, warps: 0, rivalsBeaten: 5 })).toEqual([]);
    expect(recordRace(s, { position: 3, takedowns: 0, warps: 0, rivalsBeaten: 3 })).toEqual(['TWIN_TURBINE']);
  });

  it('medal cars unlock from the campaign ladder', () => {
    const s = freshSave({ progress: { LVL1_CLOCK_HOLLOW: { best: 1, medal: 'bronze' } } });
    expect(grantEarnedCars(s)).toEqual([]);
    s.progress.LVL1_CLOCK_HOLLOW.medal = 'gold'; // gold satisfies a silver requirement
    expect(grantEarnedCars(s)).toEqual(['BLUE_KESTREL']);
  });

  it('a renamed level keeps its old id: old-save medals still unlock, the hint shows the new name (0018)', () => {
    const s = freshSave({ progress: { LVL4_MULHOLLAND_2088: { best: 2_500_000, medal: 'silver' } } });
    expect(unlockProgress(s, 'ARC_ROADSTER_88')).toMatchObject({ done: false, text: 'EARN 🥇 GOLD ON CEDAR RIDGE 2088' });
    s.progress.LVL4_MULHOLLAND_2088.medal = 'gold';
    expect(grantEarnedCars(s)).toContain('ARC_ROADSTER_88');
  });

  it('the daily streak counts consecutive days and resets on a gap', () => {
    const s = freshSave();
    const daily = (day) => recordRace(s, { position: 3, daily: true, day });
    daily('2026-10-17');
    daily('2026-10-17'); // same day twice counts once
    daily('2026-10-18');
    expect(s.career.dailyStreak).toBe(2);
    daily('2026-10-20');
    expect(s.career.dailyStreak).toBe(1);
    daily('2026-10-21');
    expect(daily('2026-10-22')).toEqual(['DUST_PURSUIT_V8']);
  });

  it('a leaderboard rival win counts toward the rival car', () => {
    const s = freshSave();
    expect(noteRivalBeaten(s, 19)).toEqual([]);
    expect(noteRivalBeaten(s)).toEqual(['TWIN_TURBINE']);
  });

  it('repairs a damaged garage: unknown cars dropped, starters restored, selection valid', () => {
    const s = ensureGarage({ garage: { owned: ['NOPE', 'GRID_CYCLE'], selected: 'NOPE', paint: null } });
    expect(s.garage.owned).toEqual(['GRID_CYCLE', 'FLUX_COUPE_88', 'PASS_RUNNER_86']);
    expect(s.garage.selected).toBe(STARTER_CAR);
    expect(s.garage.paint).toEqual({});
  });
});
