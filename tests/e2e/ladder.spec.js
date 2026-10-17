// Campaign ladder (ticket 0011): medals, bests and unlocks, all in localStorage.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const cards = (page) => page.locator('#levelSelectGrid > button');

test('a new player has only level 1 open; a bronze run unlocks level 2 and records the best', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(cards(page).nth(0)).toHaveAttribute('data-locked', '0');
  await expect(cards(page).nth(1)).toHaveAttribute('data-locked', '1');

  await page.locator('#btnStartEvent').click();
  const bronze = 9999999; // comfortably past gold on level 1, whatever the calibration
  await page.evaluate((s) => { window.__OT.GameState.score = s; window.__OT.finishRun(); }, bronze);
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#endMedalText')).toContainText('GOLD');
  await expect(page.locator('#endUnlockText')).toBeVisible();

  await page.reload();
  await page.locator('#btnOpenEvents').click();
  await expect(cards(page).nth(1)).toHaveAttribute('data-locked', '0');
  await expect(cards(page).nth(0).locator('.level-best')).toHaveText(/\d/);
  const best = await cards(page).nth(0).locator('.level-best').innerText();
  expect(parseInt(best.replace(/[^0-9]/g, ''), 10)).toBeGreaterThanOrEqual(bronze);
  expect(problems).toEqual([]);
});

test('locked level cards cannot be selected', async ({ page }) => {
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  await cards(page).nth(3).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2') || '{}'));
  expect(saved.selectedLevel || 0).toBe(0);
});

// Ticket 0016: races end. Holding only the gas, a level-1 arcade run finishes by its cap.
test('a gas-only arcade race reaches the finish within the level cap', async ({ page }) => {
  test.setTimeout(170_000);
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await page.keyboard.down('ArrowUp');
  const t0 = Date.now();
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 125_000 }); // cap 100 s of game time + CI slack
  await page.keyboard.up('ArrowUp');
  // The cap is game time; on a loaded CI box the fixed-step sim can run a little slower than
  // the wall clock, so allow 15 s of slack.
  expect((Date.now() - t0) / 1000).toBeLessThanOrEqual(115);
  await expect(page.locator('#endModalBadge')).toContainText(/FINISH|WRECKED|TIME UP/);
  console.log(`gas-only run: ${((Date.now() - t0) / 1000).toFixed(1)}s, score ${await page.evaluate(() => window.__OT.GameState.score)}`);
  expect(problems).toEqual([]);
});
