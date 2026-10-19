// Run missions (ticket 0026): three goals per run, on the title, the announcer and the results.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`results list three missions; a completed one shows ✓ and its reward at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await expect(page.locator('#titleMissions')).toHaveText('🎯 3 MISSIONS · 0/3 DONE TODAY');
    await page.keyboard.press('Enter');
    // The race starts as soon as the lazy race step is in (0170): wait for it, not a fixed beat.
    await page.waitForFunction(() => window.__OT.GameState.missions);
    const first = await page.evaluate(() => {
      const ms = window.__OT.GameState.missions;
      const m = ms[0];
      const coins = window.__OT.GameState.runCoins;
      window.__OT.mission(m.type, m.target);
      return { reward: m.reward, gained: window.__OT.GameState.runCoins - coins, types: ms.map((x) => x.type) };
    });
    expect(new Set(first.types).size).toBe(3);
    expect(first.gained).toBe(first.reward);
    await expect(page.locator('#announcerMain')).toContainText('MISSION 1/3 COMPLETE');
    await page.evaluate(() => window.__OT.finishRun());
    await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 5000 });
    const rows = page.locator('#endMissions li');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveClass(/done/);
    await expect(rows.nth(0)).toHaveText(new RegExp(`^✓ .* \\+${first.reward} ⚡$`));
    await expect(rows.nth(1)).toHaveText(/ 0\/\d+$/);
    await expect(rows.nth(0)).toBeInViewport();
    await page.screenshot({ path: `test-results/missions-${vp.width}x${vp.height}.png` });

    await page.reload();
    await expect(page.locator('#titleMissions')).toHaveText('🎯 3 MISSIONS · 1/3 DONE TODAY');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).missions);
    expect(saved).toMatchObject({ done: 1, best: 1 });
    await page.screenshot({ path: `test-results/missions-title-${vp.width}x${vp.height}.png` });
    expect(problems).toEqual([]);
  });
}

test('a daily run gets the same three missions every time', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  // startRace resolves once the race is set up (the race step is a lazy chunk, 0170).
  const pick = () => page.evaluate(async () => { await window.__OT.startRace({ daily: true }); return window.__OT.GameState.missions.map((m) => m.type); });
  const a = await pick();
  await page.evaluate(() => window.__OT.finishRun());
  expect(await pick()).toEqual(a);
});
