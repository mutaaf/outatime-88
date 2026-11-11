// Settings opened from the title leads with settings (ticket 0264): the Endless goals and the
// power-up shop belong to a paused run, not to the title gear.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = { onboarded: true, fluxCoins: 900, endless: { bestDistance: 1500, bestTier: 1, runs: 2 } };

async function seeded(page) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, SAVE);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.GameState.status === 'TITLE');
}

async function titleSettings(page) {
  // The goals chunk fills the shop on the title too (syncRunnerUi): wait until it has, so the
  // shop exists to be hidden (the first visit; on a later one it is already filled).
  await page.waitForFunction(() => document.querySelector('#pauseShop .shop-item'));
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
}

async function leadsWithSettings(page) {
  await expect(page.locator('#pauseGoals')).toBeHidden();
  await expect(page.locator('#pauseShop')).toBeHidden();
  // STEERING is the first thing under the header, in view without scrolling: nothing sits
  // between them (the goals + shop pushed it ~350 px down at either size).
  const steer = page.locator('#setHeadSteer');
  await expect(steer).toContainText('STEERING');
  const head = await page.locator('#settingsTitle').boundingBox();
  const box = await steer.boundingBox();
  expect(box.y - (head.y + head.height)).toBeLessThan(80);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(await page.locator('#settingsModal').evaluate((m) => m.scrollTop)).toBe(0);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`title gear at ${vp.width}x${vp.height}: no goals or shop, STEERING first; pause shows them; title again hides them`, async ({ page }) => {
    await page.setViewportSize(vp);
    const problems = watchPage(page);
    await seeded(page);
    await titleSettings(page);
    await leadsWithSettings(page);
    await page.locator('#btnSettingsDone').click();
    await expect(page.locator('#settingsModal')).toBeHidden();

    // Paused mid Endless run: the goals and the shop are there, as before.
    await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING');
    expect(await page.evaluate(() => window.__OT.GameState.mode)).toBe('INFINITE');
    await page.evaluate(() => window.__OT.pause());
    await page.locator('#btnHudSettings').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('#pauseGoals')).toBeVisible();
    await expect(page.locator('#pauseGoals li').first()).toBeVisible();
    await expect(page.locator('#pauseShop')).toBeVisible();
    await expect(page.locator('#pauseShop .shop-item')).toHaveCount(3);

    // Back to the title (QUIT) and open the gear again: no stale pause view.
    await page.locator('#settingsModal [data-home]').click();
    await page.waitForFunction(() => window.__OT.GameState.status === 'TITLE');
    await expect(page.locator('#settingsModal')).toBeHidden();
    await titleSettings(page);
    await leadsWithSettings(page);
    expect(problems).toEqual([]);
  });
}
