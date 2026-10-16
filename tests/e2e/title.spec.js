// Title identity (pillar 1): you can start racing without scrolling, on any screen.
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
  const details = page.locator('#howToPlay');
  expect(await details.evaluate((d) => d.open)).toBe(false);
  await details.locator('summary').click();
  expect(await details.evaluate((d) => d.open)).toBe(true);
});
