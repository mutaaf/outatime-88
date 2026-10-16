import { test, expect, devices } from '@playwright/test';
import { APP, watchPage, canvasLitFraction, hudNumber } from './helpers.js';

test.use({ ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } });

test('phone: touch start, no page scroll, race advances', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await page.locator('#btnStartRace').tap();
  await page.waitForTimeout(3500);
  expect(await hudNumber(page, 'distMetersDisplay')).toBeGreaterThan(0);
  await expect(page.locator('#btnSteerLeft')).toBeVisible();
  const box = await page.locator('#btnSteerLeft').boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
  const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  expect(scroll.w).toBeLessThanOrEqual(scroll.vw);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});
