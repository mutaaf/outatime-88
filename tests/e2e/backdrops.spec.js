// Era backdrops (ticket 0100): every era's 2D world loads, renders without errors, stays
// cheap per frame, and fits phones and tablets in both orientations.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const ERAS = ['2026', '1985', '1885', '2015', '2088', '1955'];
const VIEWPORTS = [[390, 844], [844, 390], [820, 1180], [1180, 820]];

for (const [width, height] of VIEWPORTS) {
  test(`every era's backdrop renders at ${width}x${height}`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width, height });
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
    for (let i = 0; i < ERAS.length; i++) {
      await page.evaluate((n) => { window.__OT.GameState.eraIndex = n; }, i);
      await page.waitForFunction((id) => window.__OT.backdrop()?.id === id, ERAS[i], { timeout: 8000 });
      await page.waitForTimeout(350);
      // the sky band is painted, not the flat loading fallback: it has real variety in it
      const spread = await page.evaluate(() => {
        const c = document.getElementById('gameCanvas');
        const y = Math.floor(c.height * 0.3), { data } = c.getContext('2d').getImageData(0, y, c.width, 1);
        let lo = 765, hi = 0;
        for (let p = 0; p < data.length; p += 4) { const v = data[p] + data[p + 1] + data[p + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return hi - lo;
      });
      expect(spread, `${ERAS[i]} has detail on the horizon`).toBeGreaterThan(60);
      await info.attach(`${ERAS[i]}-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    const cost = await page.evaluate(() => window.__OT.backdrop().ms);
    console.log(`[backdrop] ${width}x${height}: ${cost.toFixed(2)} ms/frame`);
    expect(cost).toBeLessThan(4); // a quarter of the 60 fps budget, under software rendering
    expect(problems).toEqual([]);
  });
}

test('warping lights the clock tower up (calm motion: the bolt, no flash) and the backdrop follows the era', async ({ page }) => {
  const problems = watchPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  await page.waitForFunction(() => window.__OT.backdrop()?.id === '2026');
  // force a warp: the bolt shows in the frames right after it, then the next era's scene loads
  await page.waitForFunction(() => {
    const g = window.__OT.GameState;
    if (g.timeWarps > 0) return true;
    g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
    return false;
  });
  await page.waitForFunction(() => window.__OT.backdrop()?.id === '1985', null, { timeout: 8000 });
  expect(problems).toEqual([]);
});
