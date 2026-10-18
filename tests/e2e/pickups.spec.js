// Pickups (src/pickups.js + the lazy src/pickup-art.js): drive a coin trail on the clean line
// and collect every coin through the one collection path, then check the crisp icon cache is
// in use at 2× device pixels. Uses the ?debug hook to place the car.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

async function race(page) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START', null, { timeout: 30000 });
}

/** The next coin trail ahead of the car: its four segments' coins (index + offset). */
function nextTrail(page) {
  return page.evaluate(() => {
    const OT = window.__OT, tr = OT.track(), g = OT.GameState;
    const from = Math.floor((g.trackPos + 1250) / 200) + 30;
    for (let i = from; i < tr.end - 12; i++) {
      const coins = [];
      for (let d = 0; d <= 9; d += 3) {
        const s = tr.seg(i + d);
        const it = s && s.items.find((x) => x.type === 'HW_COIN' && !x.collected);
        if (it) coins.push({ i: i + d, offset: it.offset });
      }
      if (coins.length === 4) return coins;
    }
    return null;
  });
}

test('2D: driving the clean line collects a whole coin trail (score, coins, combo)', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await race(page);
  const trail = await nextTrail(page);
  expect(trail).not.toBeNull();
  const before = await page.evaluate(() => ({ n: window.__OT.GameState.pickupsTaken || 0, coins: window.__OT.GameState.runCoins, score: window.__OT.GameState.score }));
  // Put the car just before the trail and steer it along the coins every frame.
  const after = await page.evaluate((trail) => new Promise((resolve) => {
    const OT = window.__OT, g = OT.GameState, tr = OT.track();
    g.trackPos = trail[0].i * 200 - 1250 - 1400;
    g.speed = 60;
    const t0 = performance.now();
    (function tick() {
      const cur = Math.floor((g.trackPos + 1250) / 200);
      const next = trail.find((c) => c.i >= cur) || trail[trail.length - 1];
      g.playerX = next.offset; g.playerVX = 0;
      const done = trail.every((c) => tr.seg(c.i).items.some((x) => x.type === 'HW_COIN' && x.collected));
      if (done || performance.now() - t0 > 20000) resolve({ done, n: g.pickupsTaken || 0, coins: g.runCoins, score: g.score });
      else requestAnimationFrame(tick);
    })();
  }), trail);
  expect(after.done).toBe(true);
  expect(after.n - before.n).toBeGreaterThanOrEqual(4);
  expect(after.coins - before.coins).toBeGreaterThanOrEqual(16);
  expect(after.score).toBeGreaterThan(before.score);
  expect(problems).toEqual([]);
});

test('2D at 2× device pixels: pickups come from the crisp icon cache', async ({ browser }, info) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const problems = watchPage(page);
  await race(page);
  const trail = await nextTrail(page);
  expect(trail).not.toBeNull();
  await page.evaluate((trail) => { const g = window.__OT.GameState; g.trackPos = trail[0].i * 200 - 1250 - 2600; g.playerX = trail[0].offset; g.speed = 20; }, trail);
  await page.waitForFunction(() => { const s = window.__OT.pickupArt(); return s && s.built > 0 && s.icons > 0; }, null, { timeout: 15000 });
  await page.evaluate(() => window.__OT.pause());
  await page.waitForTimeout(150);
  await info.attach('pickups-2x', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
  await ctx.close();
});
