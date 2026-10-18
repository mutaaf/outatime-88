import { test, expect } from '@playwright/test';
import { APP, watchPage, canvasLitFraction, hudNumber, skipToGreen } from './helpers.js';

test('boots at the base path with no errors and no external requests', async ({ page }) => {
  const problems = watchPage(page);
  const res = await page.goto(APP);
  expect(res.status()).toBe(200);
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await canvasLitFraction(page)).toBeGreaterThan(0.05);
  expect(problems).toEqual([]);
});

// Full Chrome asks for /favicon.ico when no icon is linked (a console 404); the headless shell
// here never does, so this guards the link itself.
test('links a bundled favicon under the base path', async ({ page, request }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveCount(1);
  const href = await icon.getAttribute('href');
  expect(href).toBeTruthy();
  // Never root-absolute outside the base (invariant 2), and never a third-party host.
  expect(href.startsWith('/') && !href.startsWith(APP)).toBe(false);
  const url = new URL(href, page.url());
  expect(url.host).toBe(new URL(page.url()).host);
  const res = await request.get(url.href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
  expect(problems).toEqual([]);
});

test('a race starts and advances under keyboard input', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await skipToGreen(page);
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
  // A returning player with every level open (new players start with level 1 only, ticket 0011).
  await page.addInitScript(() => {
    if (!localStorage.getItem('outatime_cruisn_88_save_v2')) {
      localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ unlockedLevel: 6 }));
    }
  });
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  const cards = page.locator('#levelSelectGrid > button');
  await expect(cards).toHaveCount(6); // five levels + the orbit skyway (ticket 0150)
  await cards.nth(2).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(saved.selectedLevel).toBe(2);
  await page.reload();
  await page.locator('#btnOpenEvents').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')));
  expect(after.selectedLevel).toBe(2);
  await expect(page.locator('#levelSelectGrid > button').nth(2)).toHaveClass(/border-orange-400/);
});
