// Results counts read like words (ticket 0289): one warp is "1 WARP", never "1 WARPS", and the
// cell stays on one line, uncut, from a small phone to the desktop. The HUD's TIME WARPS box
// ("1 JUMP") uses the same helper.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test(`one warp reads "1 WARP" and the cells fit at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true })), KEY);
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT?.startRace);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await page.evaluate(() => { const G = window.__OT.GameState; G.timeWarps = 1; G.takedowns = 1; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    await expect(page.locator('#endWarpsText')).toHaveText(/ • 1 WARP$/);
    await expect(page.locator('#endWarpsText')).not.toContainText('WARPS');

    // The widest values the cells show: 8th place, two-digit warps, 188 mph and 12 takedowns.
    await page.evaluate(() => {
      const set = (id, t) => { document.getElementById(id).textContent = t; };
      set('endWarpsText', '8TH • 12 WARPS');
      set('endPeakSpeedText', '188 MPH • 12 TD');
    });
    await page.evaluate(() => document.fonts.ready);
    const cut = await page.evaluate(() => [...document.querySelectorAll('.end-stats b')]
      .filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id));
    expect(cut).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('the HUD time-warps box says "1 JUMP" after one warp', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await expect(page.locator('#warpsCountText')).toHaveText('0 JUMPS');
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.waitForFunction(() => {
    const g = window.__OT.GameState;
    if (g.timeWarps > 0) return true;
    g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
    return false;
  }, null, { timeout: 5000 });
  await expect(page.locator('#warpsCountText')).toHaveText('1 JUMP');
  expect(problems).toEqual([]);
});
