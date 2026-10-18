// Rival racing AI (ticket 0160): a real race where the field drives lines, passes and spreads.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

for (const mode of ['ARCADE', 'INFINITE']) test(`rivals race for real (${mode}): they stay on the road, swap places and spread out`, async ({ page }) => {
  test.setTimeout(60_000);
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.traffic);
  await page.evaluate((m) => window.__OT.startRace({ mode: m }), mode);
  // The AI chunk is fetched at boot; every rival on the grid drives with a brain.
  await page.waitForFunction(() => window.__OT.traffic().racers.length === 5 && window.__OT.traffic().racers.every((r) => r.ai));
  // Let the co-pilot drive you so the race plays out the same way on any machine.
  await page.evaluate(() => { window.__OT.GameState.jarvisMode = 1; window.__OT.GameState.autoGas = true; });
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING', null, { timeout: 20_000 });

  const sample = () => page.evaluate(() => {
    const t = window.__OT.traffic();
    return {
      order: t.racers.slice().sort((a, b) => b.progress - a.progress).map((r) => r.id).join(','),
      progress: t.racers.map((r) => r.progress),
      offsets: t.racers.map((r) => r.offset),
      pos: window.__OT.GameState.racePosition,
      modes: t.racers.map((r) => r.ai.mode),
      nos: t.racers.some((r) => r.nosActive),
    };
  });
  const orders = new Set();
  const modes = new Set();
  let nosSeen = false, worstX = 0, last = null;
  for (let i = 0; i < 40; i++) {
    last = await sample();
    orders.add(last.order);
    last.modes.forEach((m) => modes.add(m));
    nosSeen = nosSeen || last.nos;
    worstX = Math.max(worstX, ...last.offsets.map(Math.abs));
    await page.waitForTimeout(300);
  }
  const stats = await page.evaluate(() => {
    const t = window.__OT.traffic();
    const sum = { passes: 0, nos: 0, mistakes: 0, brakes: 0 };
    for (const r of t.racers) for (const k of Object.keys(sum)) sum[k] += r.ai.stats[k];
    return { sum, nemesis: window.__OT.GameState.nemesisId, nemesisFlag: t.racers.filter((r) => r.nemesis).length, tier: t.aiWorld.tier };
  });
  test.info().annotations.push({ type: 'rivals', description: JSON.stringify({ orders: orders.size, modes: [...modes], nosSeen, worstX, stats, spread: Math.max(...last.progress) - Math.min(...last.progress) }) });

  expect(worstX).toBeLessThanOrEqual(0.72);                 // on the road the whole time
  expect(orders.size > 1 || stats.sum.passes > 0).toBe(true); // places changed (on a slow CI box a 12 s window may hold one order)
  expect(Math.max(...last.progress) - Math.min(...last.progress)).toBeGreaterThan(30); // the field spread out
  expect(stats.sum.passes + stats.sum.nos).toBeGreaterThan(0); // they raced, not just cruised
  expect(stats.nemesisFlag).toBe(1);
  expect(stats.tier).toBeGreaterThanOrEqual(0);
  expect(stats.nemesis).toBeTruthy();
  expect(problems).toEqual([]);
});
