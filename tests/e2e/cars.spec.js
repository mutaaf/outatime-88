// Car unlocks (ticket 0071): locked cars can't be driven, milestones unlock them, the
// car you pick is remembered and its specs (HP here) are what you race with.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const car = (page, id) => page.locator(`#characterRosterGrid button[data-car-id="${id}"]`);
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2') || '{}'));

test('locked cars stay locked until earned; an unlocked car is remembered and raced', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(car(page, 'FLUX_COUPE_88')).toHaveAttribute('data-locked', '0');
  await expect(car(page, 'PASS_RUNNER_86')).toHaveAttribute('data-locked', '0');
  await expect(car(page, 'BLUE_KESTREL')).toHaveAttribute('data-locked', '1');
  await expect(car(page, 'BLUE_KESTREL')).toContainText('SILVER ON CLOCK HOLLOW');

  // Tapping a locked car never selects it.
  await car(page, 'BLUE_KESTREL').click();
  expect(await page.evaluate(() => window.__OT.GameState.selectedCharIdx)).toBe(0);
  await page.evaluate(() => document.getElementById('garageModal').classList.add('hidden'));

  // A gold run on level 1 earns the silver-on-level-1 car.
  await page.locator('#btnStartEvent').click();
  await page.evaluate(() => { window.__OT.GameState.score = 9999999; window.__OT.finishRun(); });
  await expect(page.locator('#endUnlockText')).toContainText('NEW CAR UNLOCKED');
  await expect(page.locator('#endUnlockText')).toContainText('KESTREL');
  expect((await save(page)).career.races).toBe(1);

  await page.reload();
  await page.locator('#btnOpenEvents').click();
  await expect(car(page, 'BLUE_KESTREL')).toHaveAttribute('data-locked', '0');
  await car(page, 'BLUE_KESTREL').click();
  expect((await save(page)).garage.selected).toBe('BLUE_KESTREL');

  await page.reload();
  await page.locator('#btnOpenEvents').click();
  await page.locator('#btnStartEvent').click();
  const hp = await page.evaluate(() => [window.__OT.GameState.maxHp, window.__OT.GameState.carParamsFor]);
  expect(hp).toEqual([108, 'BLUE_KESTREL']);
  expect(problems).toEqual([]);
});
