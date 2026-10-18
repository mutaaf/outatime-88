// NOS (ticket 0122): hold Shift to burn the tank for extra speed; the HUD gauge drains.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('holding Shift burns NOS: speed goes past top speed and the gauge drains', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START');
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => { window.__OT.GameState.speed = 95; });
  const before = await page.evaluate(() => window.__OT.GameState.nosFill);
  expect(before).toBeGreaterThan(0.3);
  const gauge0 = await page.locator('#hudNos').evaluate((e) => parseFloat(e.style.width));
  // Track the peak speed while burning, in simulation time (CI runs the sim slower than real
  // time, and a bump from traffic can scrub speed mid-burn).
  await page.evaluate(() => {
    const g = window.__OT.GameState;
    g.invulnTimer = 30;
    window.__peak = 0;
    window.__nosRec = setInterval(() => { if (g.nosBurning) window.__peak = Math.max(window.__peak, g.speed); }, 5);
  });
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__OT.GameState.nosBurning === true);
  const t0 = await page.evaluate(() => window.__OT.GameState.raceTime);
  await page.waitForFunction((t) => window.__OT.GameState.raceTime - t > 0.9, t0, { timeout: 15000 });
  const mid = await page.evaluate(() => ({ s: window.__peak, f: window.__OT.GameState.nosFill }));
  await expect(page.locator('#hudSpeedCard')).toHaveClass(/is-nos/);
  await page.keyboard.up('Shift');
  expect(mid.s).toBeGreaterThan(100);
  expect(mid.f).toBeLessThan(before);
  await expect.poll(() => page.locator('#hudNos').evaluate((e) => parseFloat(e.style.width))).toBeLessThan(gauge0);
  await page.keyboard.up('ArrowUp');
  expect(problems).toEqual([]);
});
