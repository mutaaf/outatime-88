// Readability (ticket 0002): one message lane, and a phone HUD that leaves the road visible.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const intersects = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function visibleBox(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    let n = el;
    while (n) { if (parseFloat(getComputedStyle(n).opacity) < 0.05) return null; n = n.parentElement; }
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, sel);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`announcement and coach never overlap at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await page.waitForTimeout(400); // coach shows its opening tip
    await page.evaluate(() => window.__OT.announce('⚡ 88 MPH TIME WARP! ➔ 1985 ⚡', 'ERA SHIFT', 1500));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(120);
      const ann = await visibleBox(page, '#announcerMain');
      const coach = await visibleBox(page, '#coachCard');
      expect(ann).not.toBeNull();
      expect(intersects(ann, coach)).toBeFalsy();
    }
    expect(problems).toEqual([]);
  });
}

test('phone HUD takes at most 18% of the screen height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.waitForTimeout(500);
  const box = await page.locator('header').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(844 * 0.18);
  // On phones the settings gear (sound, tilt, pause) is the HUD's last button (ticket 0050).
  const gear = await page.locator('#btnHudSettings').boundingBox();
  expect(gear.x + gear.width).toBeLessThanOrEqual(390); // nothing hangs off the right edge
});
