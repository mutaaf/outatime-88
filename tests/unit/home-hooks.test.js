// Home screen hooks (ticket 0185): true, personal reasons to play, ranked; never fake urgency.
import { describe, it, expect } from 'vitest';
import { HOME_HOOKS, NEWS, NEWS_VIEWS, bestHook, carHook, dailyHook, fmtLeft, goalHook, homeHooks, isFirstVisit, noteNewsSeen, untilNextDay } from '../../src/home-hooks.js';
import { CAR_SPECS, ensureGarage } from '../../src/cars.js';
import { tierStart } from '../../src/endless.js';

const NOW = Date.UTC(2026, 9, 19, 18, 30); // 2026-10-19 18:30 UTC
const save = (over = {}) => ensureGarage({ bestScore: 0, onboarded: false, fluxCoins: 0, progress: {}, endless: null, ...over });

describe('first visit', () => {
  it('a fresh save gets the pitch; any finished run (or onboarding) gets the hooks', () => {
    expect(isFirstVisit(save())).toBe(true);
    expect(isFirstVisit(save({ onboarded: true }))).toBe(false);
    expect(isFirstVisit(save({ bestScore: 10 }))).toBe(false);
    expect(isFirstVisit(save({ endless: { bestDistance: 50, bestTier: 1, runs: 1 } }))).toBe(false);
  });
});

describe('the daily countdown is real', () => {
  it('counts to the next UTC midnight', () => {
    expect(untilNextDay(NOW)).toBe(5.5 * 3600e3);
    expect(fmtLeft(untilNextDay(NOW))).toBe('5H 30M');
    expect(fmtLeft(12 * 60e3)).toBe('12M');
    expect(fmtLeft(20e3)).toBe('<1M');
  });
  it('a live streak (played yesterday) is the top reason; done today waits for the new road', () => {
    const fresh = dailyHook(save(), NOW);
    expect(fresh.line).toMatch(/SAME ROAD FOR EVERYONE · 5H 30M LEFT/);
    const streak = dailyHook(save({ career: { dailyStreak: 3, lastDailyDay: '2026-10-18' } }), NOW);
    expect(streak.line).toBe('KEEP YOUR 🔥 3-DAY STREAK · 5H 30M LEFT');
    expect(streak.score).toBeGreaterThan(fresh.score);
    const lapsed = dailyHook(save({ career: { dailyStreak: 3, lastDailyDay: '2026-10-10' } }), NOW);
    expect(lapsed.line).not.toMatch(/STREAK/);
    const done = dailyHook(save({ career: { dailyStreak: 4, lastDailyDay: '2026-10-19' } }), NOW);
    expect(done.title).toBe('DAILY ✓ · 🔥 4 DAYS');
    expect(done.line).toBe('NEW ROAD IN 5H 30M');
    expect(done.score).toBeLessThan(fresh.score);
  });
});

describe('best run', () => {
  it('no run yet asks how far; a best shows the next tier to beat with real numbers', () => {
    expect(bestHook(save()).line).toBe('HOW FAR CAN YOU GO?');
    const best = tierStart(2) + 1080; // partway through tier 2
    const h = bestHook(save({ endless: { bestDistance: best, bestTier: 2, runs: 4 } }));
    expect(h.title).toBe(`YOUR BEST ${best.toLocaleString('en-US')} m`);
    expect(h.line).toContain(`TIER 3 STARTS AT ${tierStart(3).toLocaleString('en-US')} m`);
    expect(h.progress).toBeGreaterThan(0);
    expect(h.progress).toBeLessThan(1);
  });
});

describe('next car', () => {
  const names = { BULLDOG_VAN: "'83 Bulldog Cargo Van", VOLT_ROADSTER: 'Volt Roadster' };
  it('a coin car you can afford wins, and says so', () => {
    const h = carHook(save({ fluxCoins: 600 }), names);
    expect(h.car).toBe('BULLDOG_VAN');
    expect(h.title).toBe('NEW CAR · BUY IT NOW!');
    expect(h.score).toBe(100);
  });
  it('otherwise the closest unlock, with the real progress', () => {
    const h = carHook(save({ fluxCoins: 250 }), names);
    expect(h.title).toBe('NEXT CAR');
    expect(h.progress).toBeCloseTo(0.5, 5); // 250 of the 500-coin van
    expect(h.line).toContain('250 / 500');
  });
  it('nothing left to unlock = no card', () => {
    const s = save();
    s.garage.owned = Object.keys(CAR_SPECS);
    expect(carHook(s)).toBeNull();
  });
});

describe('goals', () => {
  it('reads the save without changing it; two of three done is close to a level up', () => {
    const s = save({ endless: { bestDistance: 1, bestTier: 1, runs: 1, goals: { level: 1, active: [{ type: 'LOOPS', target: 1, done: true }, { type: 'CLEAN', target: 900, done: true }, { type: 'TIER', target: 2, done: false }] } } });
    const before = JSON.stringify(s);
    const h = goalHook(s);
    expect(h.title).toBe('LV 2 GOALS · 2/3');
    expect(h.line).toBe('REACH TIER 2 → LEVEL UP');
    expect(JSON.stringify(s)).toBe(before);
    expect(goalHook(save()).title).toBe('LV 1 GOALS · 0/3'); // no goals yet: level 1's set
  });
});

describe('ranking', () => {
  it(`shows at most ${HOME_HOOKS}, best first, and every hook has an action`, () => {
    const s = save({ onboarded: true, fluxCoins: 600, career: { dailyStreak: 2, lastDailyDay: '2026-10-18' } });
    const hooks = homeHooks(s, { now: NOW, rival: '⚔️ RIVAL BIF IS 1,000 AHEAD THIS WEEK', bigScreen: true });
    expect(hooks).toHaveLength(HOME_HOOKS);
    expect(hooks[0].id).toBe('car');
    expect(hooks[1].id).toBe('daily');
    for (let i = 1; i < hooks.length; i++) expect(hooks[i - 1].score).toBeGreaterThanOrEqual(hooks[i].score);
    for (const h of hooks) expect(['play', 'daily', 'garage', 'ranks', 'tv']).toContain(h.act);
    const rival = homeHooks(s, { now: NOW, rival: '⚔️ RIVAL BIF IS 1,000 AHEAD THIS WEEK' }).find((h) => h.id === 'rival');
    expect(rival.icon).toBe('⚔️');
    expect(rival.line).toBe('RIVAL BIF IS 1,000 AHEAD THIS WEEK');
  });
  it('news shows a few times, then retires; tapping retires it at once; TV news is big-screen only', () => {
    const s = save({ onboarded: true });
    const first = () => homeHooks(s, { now: NOW, bigScreen: true }).find((h) => h.isNew);
    expect(first().id).toBe(NEWS[0].id);
    for (let i = 0; i < NEWS_VIEWS; i++) noteNewsSeen(s, NEWS[0].id);
    expect(first().id).toBe(NEWS[1].id);
    for (const n of NEWS.slice(1)) noteNewsSeen(s, n.id, true);
    expect(first()).toBeUndefined();
    const phone = save({ onboarded: true });
    expect(homeHooks(phone, { now: NOW, bigScreen: false }).some((h) => h.act === 'tv')).toBe(false);
  });
  it('a car you already own is never news', () => {
    const s = save({ onboarded: true });
    s.garage.owned.push('VOLT_ROADSTER');
    for (const n of NEWS) if (!n.car) noteNewsSeen(s, n.id, true);
    expect(homeHooks(s, { now: NOW, bigScreen: true }).some((h) => h.isNew)).toBe(false);
  });
});
