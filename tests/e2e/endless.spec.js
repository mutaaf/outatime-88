// Endless track: driving far down the road reuses the same pooled segments and the same 3D
// road chunks instead of building new ones. Uses the ?debug hook to fast-forward.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('3D: a long drive keeps the segment ring and the road chunk pool flat, no errors', async ({ page }) => {
  test.setTimeout(120000);
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=3d`);
  await page.waitForFunction(() => window.__OT);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__OT.view().mode === '3d' && window.__OT.view().stats && window.__OT.view().stats.chunks > 0, null, { timeout: 30000 });
  const sample = () => page.evaluate(() => {
    const t = window.__OT.track();
    const s = window.__OT.view().stats;
    return { allocated: t.allocated, start: t.start, end: t.end, chunkObjects: s.chunkObjects, chunks: s.chunks };
  });
  await page.waitForTimeout(600);
  const first = await sample();
  // Fast-forward: ~40 jumps of 30 segments' worth each, letting the road rebuild between them.
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => {
      const g = window.__OT.GameState;
      g.trackPos += 6000;
      g.distance = Math.min(g.distance, 10); // stay mid-race: no finish line while we skip ahead
    });
    await page.waitForTimeout(120);
  }
  const last = await sample();
  expect(last.end).toBeGreaterThan(first.end + 1000);
  expect(last.start).toBeGreaterThan(0);                          // the ring wrapped…
  expect(last.end - last.start).toBeLessThanOrEqual(1024);
  expect(last.allocated).toBeLessThanOrEqual(1024);               // …reusing its segments
  expect(last.chunkObjects).toBeLessThanOrEqual(first.chunkObjects + 4); // and its road meshes
  expect(last.chunks).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});
