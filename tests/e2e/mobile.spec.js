import { test, expect, devices } from '@playwright/test';
import { APP, watchPage, canvasLitFraction, hudNumber, skipToGreen } from './helpers.js';

test.use({ ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } });

test('phone: touch start, no page scroll, race advances', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(APP);
  await page.locator('#btnStartRace').tap();
  await skipToGreen(page, { tap: true });
  await page.waitForTimeout(2000);
  expect(await hudNumber(page, 'distMetersDisplay')).toBeGreaterThan(0);
  await expect(page.locator('#tcBoost')).toBeVisible();
  const box = await page.locator('#tcDrift').boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
  const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  expect(scroll.w).toBeLessThanOrEqual(scroll.vw);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

test('phone: a quick tap on the steering side clears the first-run steer prompt', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  await page.goto(APP);
  await page.locator('#btnStartRace').tap();
  await skipToGreen(page, { tap: true });
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.touchscreen.tap(90, 720);
  await expect(page.locator('#steerHint')).toBeHidden();
  expect(problems).toEqual([]);
});
