// Haptics on a real touch path: Android vibrates, iOS ticks a hidden switch, and the
// Settings switch turns it all off. (Whether the hand feels it is only checkable on a device.)
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function race(page, { ios = false, controls = {} } = {}) {
  await page.addInitScript(([key, c, iosMode, ua]) => {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: Object.assign({ coachSeen: true }, c) }));
    window.__buzz = [];
    if (iosMode) {
      // Safari: no Vibration API, but <input switch> exists and its label click is the haptic.
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: undefined });
      Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => ua });
      Object.defineProperty(HTMLInputElement.prototype, 'switch', { configurable: true, get() { return this.hasAttribute('switch'); } });
      const click = HTMLLabelElement.prototype.click;
      HTMLLabelElement.prototype.click = function () { if (this.querySelector('input[switch]')) window.__buzz.push('tick'); return click.call(this); };
    } else {
      navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
    }
  }, [SAVE_KEY, controls, ios, IPHONE]);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(300);
  return page.context().newCDPSession(page);
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 8, radiusY: 8, force: 1 })) });
const centre = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const buzzes = (page) => page.evaluate(() => window.__buzz.slice());

test('Android: the stick, a button and WARP each buzz with their own pattern', async ({ page }) => {
  const problems = watchPage(page);
  const cdp = await race(page);
  await touch(cdp, 'touchStart', [{ x: 90, y: 680, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  await touch(cdp, 'touchStart', [{ ...(await centre(page, '#tcBoost')), id: 2 }]);
  await touch(cdp, 'touchEnd', []);
  await touch(cdp, 'touchStart', [{ ...(await centre(page, '#tcJump')), id: 3 }]);
  await touch(cdp, 'touchEnd', []);
  const b = await buzzes(page);
  expect(b).toEqual([[9], [16, 30, 24], [10]]);
  expect(problems).toEqual([]);
});

test('iOS (no Vibration API): touches tick the hidden switch instead', async ({ page }) => {
  const cdp = await race(page, { ios: true });
  await touch(cdp, 'touchStart', [{ x: 90, y: 680, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  await touch(cdp, 'touchStart', [{ ...(await centre(page, '#tcJump')), id: 2 }]);
  await touch(cdp, 'touchEnd', []);
  expect((await buzzes(page)).length).toBeGreaterThanOrEqual(2);
});

test('Haptics off in Settings: nothing buzzes', async ({ page }) => {
  const cdp = await race(page, { controls: { haptics: false } });
  await touch(cdp, 'touchStart', [{ x: 90, y: 680, id: 1 }, { ...(await centre(page, '#tcBoost')), id: 2 }]);
  await touch(cdp, 'touchEnd', []);
  expect(await buzzes(page)).toEqual([]);
});

test('Settings → STEERING & BUTTONS has a Haptics switch and a strength slider', async ({ page }) => {
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await page.locator('#btnOpenControls').tap();
  await expect(page.locator('#tcPanel [data-toggle="haptics"]')).toBeChecked();
  await expect(page.locator('#tcPanel [data-slider="hapticStrength"]')).toBeVisible();
});
