// Traffic formations (ticket 0027): in a real race, passed traffic parks and comes back as whole
// patterns drawn for the wave, every car clear of the racing line, and the race keeps running.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

test('traffic comes back in whole formations for the wave, never on the racing line', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await racing(page);
  await page.evaluate(() => { window.__OT.GameState.waveTier = 4; });
  await page.keyboard.down('ArrowUp');
  // Passing traffic parks it; the next pattern goes down once enough cars are parked, and a
  // multi-car one comes along soon (two cars start parked, so only SOLO can come first).
  await page.waitForFunction(() => {
    const f = window.__OT.traffic().formations;
    return f && f.log.length >= 2 && f.log.some((e) => e.placed > 1);
  }, null, { timeout: 40000 });
  const r = await page.evaluate(() => {
    const T = window.__OT.traffic();
    const live = T.traffic.filter((t) => !t.idle && !t.takenDown);
    return {
      log: T.formations.log.slice(),
      pool: T.traffic.length,
      parkedVisible: T.traffic.filter((t) => t.idle && (t.active || !t.takenDown)).length,
      onLine: live.filter((t) => !T.planner.line.isClear(t.worldZ, t.offset, t.halfW, t.halfL)).length,
      status: window.__OT.GameState.status,
    };
  });
  await page.keyboard.up('ArrowUp');
  expect(r.pool).toBe(6);
  for (const e of r.log) {
    expect(['SOLO', 'STAGGER', 'CONVOY', 'SLALOM', 'GATE', 'WALL']).toContain(e.id);
    expect(e.placed).toBeGreaterThanOrEqual(1);
    expect(e.placed).toBeLessThanOrEqual(e.want);
  }
  expect(r.parkedVisible).toBe(0);
  expect(r.onLine).toBe(0);
  expect(r.status).toBe('PLAYING');
  expect(problems).toEqual([]);
});
