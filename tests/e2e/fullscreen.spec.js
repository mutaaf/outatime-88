// FULLSCREEN button (ticket 0307): Settings → View → ENTER / EXIT FULLSCREEN, for desktop and
// tablets; hidden where the browser has no Fullscreen API (iPhone). The real API is stubbed so the
// test viewport never resizes: a press flips a flag and fires fullscreenchange, as a browser would.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const seed = (page) => page.addInitScript((k) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true }));
}, KEY);
const stubFullscreen = (page) => page.addInitScript(() => {
  let el = null;
  window.__fsCalls = [];
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => el });
  Element.prototype.requestFullscreen = function () {
    window.__fsCalls.push('enter');
    el = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve();
  };
  Document.prototype.exitFullscreen = function () {
    window.__fsCalls.push('exit');
    el = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve();
  };
  window.__fsEsc = () => { el = null; document.dispatchEvent(new Event('fullscreenchange')); }; // the browser's Esc
});

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`FULLSCREEN at ${vp.width}x${vp.height}: a press enters, the label flips, Esc and the button leave`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await seed(page);
    await stubFullscreen(page);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnOpenSettings').click();
    const btn = page.locator('#setFullscreen');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('⛶ ENTER FULLSCREEN');
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44); // touch target (invariant 5)
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    // Keyboard path: Enter enters, Space exits.
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveText('⛶ EXIT FULLSCREEN');
    await page.keyboard.press('Space');
    await expect(btn).toHaveText('⛶ ENTER FULLSCREEN');
    // A click enters, then the browser's Esc leaves without the button: the label follows.
    await btn.click();
    await expect(btn).toHaveText('⛶ EXIT FULLSCREEN');
    await page.evaluate(() => window.__fsEsc());
    await expect(btn).toHaveText('⛶ ENTER FULLSCREEN');
    expect(await page.evaluate(() => window.__fsCalls)).toEqual(['enter', 'exit', 'enter']);
    expect(problems).toEqual([]);
  });
}

test('FULLSCREEN is hidden when the browser has no Fullscreen API (iPhone)', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page);
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { configurable: true, get: () => false });
  });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#btnSettingsDone')).toBeVisible();
  await expect(page.locator('#setFullscreen')).toBeHidden();
  expect(problems).toEqual([]);
});
