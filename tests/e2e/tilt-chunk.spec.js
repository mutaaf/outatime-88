// The tilt sensor is a lazy chunk (0223, src/tilt.js): a reading that arrives before the chunk
// is kept and sets the zero once it lands. (A failed fetch reloads the page, src/offline.js.)
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
// An iPad-style permission gate that says yes (settings.spec.js does the same).
test.beforeEach(({ page }) => page.addInitScript(() => {
  window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
}));

const tilt = (page, beta, gamma) => page.evaluate(([b, g]) => {
  const e = new Event('deviceorientation');
  Object.assign(e, { beta: b, gamma: g, alpha: 0 });
  window.dispatchEvent(e);
}, [beta, gamma]);
const steer = (page) => page.evaluate(() => window.__OT.InputState.tiltSteerVal);

test('a reading that lands while the tilt chunk loads is read once the chunk lands', async ({ page }) => {
  const problems = watchPage(page);
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route(/\/tilt-[^/]*\.js$/, async (route) => { await held; await route.continue(); });
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  const chip = page.locator('#btnTitleTilt');
  await chip.tap();
  await tilt(page, 3, 7); // how you hold it, before the chunk is in (Chrome also sends one with no angles)
  await page.waitForTimeout(1800); // past the no-signal clock: a held reading counts as a signal
  expect(await page.evaluate(() => window.__OT.InputState.tiltEnabled)).toBe(true);
  await expect(chip).toContainText('ON'); // still waiting, not N/A
  expect((await steer(page))).toBe(0);
  release();
  await expect(page.locator('#tiltHudBar')).not.toHaveClass(/\bhidden\b/); // 'on' only once a reading is read
  expect(await page.evaluate(() => window.__OT.InputState.tiltZeroOffset)).toBe(7);
  await tilt(page, 3, 21);
  expect((await steer(page))).toBeGreaterThan(0.3);
  expect(problems).toEqual([]);
});
