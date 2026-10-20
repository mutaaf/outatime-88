// Traffic formations (ticket 0027): in a real race, freed traffic comes back as whole patterns
// drawn for the wave, every car clear of the racing line, and the race keeps running.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

test('traffic respawns in formations for the wave, never on the racing line', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await racing(page);
  await page.evaluate(() => { window.__OT.GameState.waveTier = 4; });
  await page.keyboard.down('ArrowUp');
  // Passing traffic frees its slots; each comes back as the next car of a formation.
  await page.waitForFunction(() => {
    const f = window.__OT.traffic().formations;
    return f && f.log.length >= 2;
  }, null, { timeout: 40000 });
  const r = await page.evaluate(() => {
    const T = window.__OT.traffic();
    const placed = T.traffic.filter((t) => [40, 42, 44].includes(t.mph));
    return {
      log: T.formations.log.slice(),
      status: window.__OT.GameState.status,
      onLine: placed.filter((t) => !t.takenDown && !T.planner.line.isClear(t.worldZ, t.offset, t.halfW)).length,
      placed: placed.length,
    };
  });
  await page.keyboard.up('ArrowUp');
  for (const id of r.log) expect(['SOLO', 'STAGGER', 'CONVOY', 'SLALOM', 'GATE', 'WALL']).toContain(id);
  expect(r.placed).toBeGreaterThan(0);
  expect(r.onLine).toBe(0);
  expect(r.status).toBe('PLAYING');
  expect(problems).toEqual([]);
});
