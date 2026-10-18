// Endless runner loop (ticket 0151): Time Storm, run goals and the coins-only continue.
import { describe, it, expect } from 'vitest';
import { STORM, createStorm, stepStorm, stormRespite, runnerMult, MULT_MAX, continueCost, canContinue } from '../../src/runner.js';
import { GOALS, goalsFor, ensureGoals, checkGoals, goalProgress, goalLabel } from '../../src/runner-goals.js';

const dt = 1 / 120;
const drive = (st, mph, secs, diff = 0, opts = {}) => {
  let r = null;
  for (let t = 0; t < secs && !r; t += dt) r = stepStorm(st, mph, diff, dt, opts.scrape, false);
  return r;
};

describe('Time Storm', () => {
  it('falls back when you drive clean and fast, never past its max gap', () => {
    const st = createStorm();
    drive(st, 90, 30);
    expect(st.gap).toBe(STORM.maxGap);
    expect(st.warn).toBe(0);
  });
  it('closes in when you crawl, grind the wall or crash, and catches you', () => {
    const st = createStorm();
    const slow = st.gap;
    drive(st, 30, 2);
    expect(st.gap).toBeLessThan(slow);
    const before = st.gap;
    stepStorm(st, 60, 0, dt, false, true);
    expect(st.gap).toBeLessThan(before - STORM.crash + 1);
    const g = st.gap;
    drive(st, 50, 1, 0, { scrape: true });
    expect(st.gap).toBeLessThan(g);
    expect(drive(st, 10, 60)).toBe('caught');
  });
  it('is faster at higher difficulty and warns as it closes', () => {
    const a = createStorm(), b = createStorm();
    drive(a, 70, 5, 0); drive(b, 70, 5, 1);
    expect(b.gap).toBeLessThan(a.gap);
    const c = createStorm(); c.gap = STORM.warnAt / 2;
    stepStorm(c, 60, 0, dt, false, false);
    expect(c.warn).toBeGreaterThan(0.4);
    stormRespite(c);
    expect(c.gap).toBeGreaterThanOrEqual(STORM.respite);
    expect(c.warn).toBe(0);
  });
});

describe('run goals', () => {
  it('deal three distinct kinds per level and rotate through every kind', () => {
    const seen = new Set();
    for (let lv = 0; lv < GOALS.length; lv++) {
      const set = goalsFor(lv);
      expect(new Set(set.map((g) => g.type)).size).toBe(3);
      set.forEach((g) => seen.add(g.type));
    }
    expect(seen.size).toBe(GOALS.length);
    expect(goalsFor(10)).toEqual(goalsFor(10)); // deterministic
  });
  it('targets grow as levels rise', () => {
    const first = goalsFor(0)[0];
    const later = goalsFor(GOALS.length)[0]; // same kind, one rotation on
    expect(later.type).toBe(first.type);
    expect(later.target).toBeGreaterThan(first.target);
  });
  it('mark goals met by a run, and level up when all three are done', () => {
    const save = {};
    const goals = ensureGoals(save);
    expect(goals.level).toBe(0);
    const stats = { coins: 0, driftSecs: 0, loops: 0, cleanBest: 0, tier: 1, nearMisses: 0, nosSecs: 0 };
    const [a, b, c] = goals.active;
    const statOf = (g) => GOALS.find((d) => d.type === g.type).stat;
    stats[statOf(a)] = a.target;
    expect(checkGoals(goals, stats).map((g) => g.type)).toEqual([a.type]);
    expect(checkGoals(goals, stats)).toEqual([]); // once only
    expect(goalProgress(a, stats)).toBe('✓');
    expect(goalLabel(b)).toMatch(/\d/);
    stats[statOf(b)] = b.target; stats[statOf(c)] = c.target + 5;
    const r = checkGoals(goals, stats);
    expect(r).toHaveLength(2);
    expect(r.levelUp).toBe(1);
    expect(goals.level).toBe(1);
    expect(goals.active.every((g) => !g.done)).toBe(true);
  });
  it('repair a broken save', () => {
    const save = { endless: { goals: { level: 3, active: [{ type: 'NOPE' }] } } };
    const g = ensureGoals(save);
    expect(g.level).toBe(3);
    expect(g.active).toEqual(goalsFor(3));
  });
  it('the multiplier climbs 0.1× a level and caps', () => {
    expect(runnerMult(0)).toBe(1);
    expect(runnerMult(3)).toBeCloseTo(1.3);
    expect(runnerMult(99)).toBe(MULT_MAX);
  });
});

describe('continue', () => {
  it('costs more the further you got, once per run, coins only', () => {
    expect(continueCost(5)).toBeGreaterThan(continueCost(1));
    expect(canContinue(false, continueCost(3), 3)).toBe(true);
    expect(canContinue(false, continueCost(3) - 1, 3)).toBe(false);
    expect(canContinue(true, 1e9, 3)).toBe(false);
  });
});
