import { test, expect } from '@playwright/test';
import { APP, watchPage, canvasLitFraction, hudNumber } from './helpers.js';

test('boots at the base path with no errors and no external requests', async ({ page }) => {
  const problems = watchPage(page);
  const res = await page.goto(APP);
  expect(res.status()).toBe(200);
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

test('a race starts and advances under keyboard input', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3000);
  const dist1 = await hudNumber(page, 'distMetersDisplay');
  const speed = await hudNumber(page, 'speedDisplay');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  const dist2 = await hudNumber(page, 'distMetersDisplay');
  await page.keyboard.up('ArrowUp');
  expect(speed).toBeGreaterThan(0);
  expect(dist2).toBeGreaterThan(dist1);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

test('level selection persists across reload under the same save key', async ({ page }) => {
  await page.goto(APP);
  const cards = page.locator('#levelSelectGrid > button');
  await expect(cards).toHaveCount(5);
  await cards.nth(2).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(saved.selectedLevel).toBe(2);
  await page.reload();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(after.selectedLevel).toBe(2);
  await expect(page.locator('#levelSelectGrid > button').nth(2)).toHaveClass(/border-orange-400/);
});
