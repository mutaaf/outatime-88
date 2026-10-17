// Eras (ticket 0008): warping cycles through every era, including 1955 Atomic Diner.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Average colour of the top tenth of the canvas (the sky). */
const skyColour = (page) => page.evaluate(() => {
  const c = document.getElementById('gameCanvas');
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, Math.max(1, Math.floor(c.height * 0.1)));
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 31) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return [r / n, g / n, b / n];
});

test('forcing warps reaches the 1955 Atomic Diner era with its own daytime sky', async ({ page }) => {
  const problems = watchPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // no shake or flash in the sky samples
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  const neonSky = await skyColour(page);

  for (let n = 0; n < 8; n++) {
    if ((await page.locator('#eraBadge').innerText()).includes('1955')) break;
    const before = await page.evaluate(() => window.__OT.GameState.timeWarps);
    // Re-arm on every poll: a bump can drain the meter or drop speed before the warp check runs.
    await page.waitForFunction((b) => {
      const g = window.__OT.GameState;
      if (g.timeWarps > b) return true;
      g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
      return false;
    }, before, { timeout: 5000 });
  }
  await expect(page.locator('#eraBadge')).toContainText('1955 • ATOMIC DINER');

  // Let the warp flash fade, then the sky must be the pastel 1955 one, far brighter than neon night.
  await page.waitForTimeout(600);
  const dinerSky = await skyColour(page);
  const lum = ([r, g, b]) => r + g + b;
  expect(lum(dinerSky)).toBeGreaterThan(lum(neonSky) + 150);
  expect(problems).toEqual([]);
});
