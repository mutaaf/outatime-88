// Title identity (pillar 1) and one-tap start (ticket 0022): PLAY is on screen everywhere,
// one tap anywhere races, and a new player is taught to steer in the race itself.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test(`START is fully visible on load at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(APP);
    const box = await page.locator('#btnStartRace').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await expect(page.locator('#titleWordmark')).toBeInViewport();
    expect(problems).toEqual([]);
  });
}

test('how-to-play starts collapsed and opens on tap', async ({ page }) => {
  await page.goto(APP);
  await page.locator('#btnOpenEvents').click();
  const details = page.locator('#howToPlay');
  expect(await details.evaluate((d) => d.open)).toBe(false);
  await details.locator('summary').click();
  expect(await details.evaluate((d) => d.open)).toBe(true);
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`one tap anywhere on the title starts a race at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    // Few things to read: PLAY, five small icons (settings added in 0050), the 2D/3D chip
    // (0040, operator request), the racer/stats chip (0090), and the TILT chip on touch only.
    const buttons = await page.locator('#titleScreen button:visible').count();
    expect(buttons).toBeLessThanOrEqual(8);
    // Tap the empty middle of the screen (the car on the road), not a button.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect(page.locator('#titleScreen')).toBeHidden();
    expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    expect(problems).toEqual([]);
  });
}

test('Enter starts a race from the title; the icons open their panels instead', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenEvents').click();
  await expect(page.locator('#startModal')).toBeVisible();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('TITLE');
  await page.locator('#btnCloseEvents').click();
  await expect(page.locator('#startModal')).toBeHidden();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
});

test('a new player gets a steer prompt that leaves once they steer', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('#steerHint')).toBeHidden();
});

test('a returning player is not prompted', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 5000 })));
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await expect(page.locator('#steerHint')).toBeHidden();
});
