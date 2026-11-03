// "Fair field" (ticket 0211): Settings → RACE → RIVALS. CLOSE PACK is the default (today's rubber
// band, old saves included); FAIR FIELD, picked by keyboard or tap, survives a reload, and the next
// race's rival AI pulls its catch-up at 40%. The daily ignores it and races the close pack.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE);
/** The race's catch-up as the race flow set it, and as the rival AI's world reads it. */
const bands = (page) => page.evaluate(() => [window.__OT.GameState.catchUp, window.__OT.traffic().aiWorld?.band]);

test('RIVALS is CLOSE PACK by default, FAIR FIELD by keyboard survives a reload and softens the band, the daily ignores it', async ({ page }) => {
  const problems = watchPage(page);
  // A save from before 0211: its settings have no rivals field.
  await page.addInitScript((k) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(k, JSON.stringify({ settings: { motion: 'auto', difficulty: 'normal', coach: true, hud: 'normal', keys: null } }));
  }, SAVE);
  await page.goto(`${APP}?debug`);

  // The default race is today's close pack.
  await page.evaluate(() => window.__OT.startRace());
  await racing(page);
  await expect.poll(() => bands(page)).toEqual([1, 1]);
  await page.evaluate(() => window.__OT.pause());
  await page.reload();

  await page.locator('#btnOpenSettings').click();
  const pack = page.locator('[data-setting="rivals"] [data-value="pack"]');
  const fair = page.locator('[data-setting="rivals"] [data-value="fair"]');
  await expect(pack).toHaveAttribute('aria-pressed', 'true');
  await expect(fair).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#setRivalsNote')).toContainText(/daily/i);

  // Keyboard path: Tab reaches FAIR FIELD from CLOSE PACK, and Enter picks it.
  await pack.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.dataset.value)).toBe('fair');
  await page.keyboard.press('Enter');
  await expect(fair).toHaveAttribute('aria-pressed', 'true');
  await expect(pack).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__OT.GameState.status)).not.toBe('PLAYING'); // Enter stayed in the panel
  expect((await saved(page)).settings.rivals).toBe('fair');

  await page.reload();
  await page.locator('#btnOpenSettings').click();
  await expect(fair).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnSettingsDone').click();

  // A solo race on FAIR FIELD: the rival AI's band is 0.4.
  await page.evaluate(() => window.__OT.startRace());
  await racing(page);
  await expect.poll(() => bands(page)).toEqual([0.4, 0.4]);
  await page.evaluate(() => window.__OT.pause());

  // The daily is seeded and shared: it races the close pack whatever the setting says.
  await page.evaluate(() => window.__OT.startRace({ daily: true }));
  await expect.poll(() => page.evaluate(() => Boolean(window.__OT.GameState.daily))).toBe(true);
  await racing(page);
  await expect.poll(() => bands(page)).toEqual([1, 1]);
  expect((await saved(page)).settings.rivals).toBe('fair'); // the setting itself is untouched

  // Back to CLOSE PACK by tap.
  await page.evaluate(() => window.__OT.pause());
  await page.locator('#btnHudSettings').click();
  await pack.click();
  expect((await saved(page)).settings.rivals).toBe('pack');
  expect(problems).toEqual([]);
});
