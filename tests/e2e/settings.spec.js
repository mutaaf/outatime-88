// Settings + tilt (ticket 0050): a gear on the title and in the race HUD, a one-tap TILT chip
// on touch devices, the iOS permission flow, recenter/sensitivity/invert, and settings that
// survive a reload.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE);

/** Pretend to be an iPad (a requestPermission gate answering `answer`), or, with null, an
 *  Android tablet with no gate at all. */
const fakeTiltGate = (page, answer) => page.addInitScript((a) => {
  window.__permAsks = 0;
  if (a === null) { delete window.DeviceOrientationEvent.requestPermission; return; }
  window.DeviceOrientationEvent.requestPermission = () => { window.__permAsks++; return Promise.resolve(a); };
}, answer);
const tilt = (page, beta, gamma) => page.evaluate(([b, g]) => {
  const e = new Event('deviceorientation');
  Object.assign(e, { beta: b, gamma: g, alpha: 0 });
  window.dispatchEvent(e);
}, [beta, gamma]);

test('the title gear opens settings; choices survive a reload', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#titleScreen')).toBeVisible(); // opening settings did not start a race
  await page.locator('[data-setting="difficulty"] [data-value="hard"]').click();
  await page.locator('[data-setting="motion"] [data-value="reduce"]').click();
  await page.locator('#setMusic').fill('30');
  await page.keyboard.press('Enter'); // focus is in the panel: Enter must not start a race
  expect(await page.evaluate(() => window.__OT.GameState.status)).not.toBe('PLAYING');
  await page.locator('#btnSettingsDone').click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  expect((await saved(page)).settings).toMatchObject({ difficulty: 'hard', motion: 'reduce', musicVolume: 0.3 });
  expect(await page.evaluate(() => window.__OT.GameState.reducedMotion)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');

  await page.reload();
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="difficulty"] [data-value="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#setMusic')).toHaveValue('30');
  expect(problems).toEqual([]);
});

test('the HUD gear pauses the race and RESUME carries on', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#btnSettingsDone')).toHaveText(/RESUME/);
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
  const pos = await page.evaluate(() => window.__OT.GameState.trackPos);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__OT.GameState.trackPos)).toBe(pos);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).toBeHidden();
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  expect(problems).toEqual([]);
});

test.describe('on a touch tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test('one tap on the title TILT chip asks iOS once, then steers by tilting', async ({ page }) => {
    const problems = watchPage(page);
    await fakeTiltGate(page, 'granted');
    await page.goto(`${APP}?debug`);
    const chip = page.locator('#btnTitleTilt');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('OFF');
    await chip.tap();
    await expect(page.locator('#titleScreen')).toBeVisible(); // the chip doesn't start the race
    expect(await page.evaluate(() => window.__permAsks)).toBe(1);
    await tilt(page, 3, 0); // first reading = how you hold it = straight
    await expect(chip).toContainText('ON');
    await tilt(page, 3, 14);
    const right = await page.evaluate(() => window.__OT.InputState.tiltSteerVal);
    expect(right).toBeGreaterThan(0.3);
    await tilt(page, 3, -14);
    expect(await page.evaluate(() => window.__OT.InputState.tiltSteerVal)).toBeLessThan(-0.3);

    // Invert flips it; recenter makes the current hold straight.
    await page.locator('#btnOpenSettings').tap();
    await expect(page.locator('#tiltStatus')).toHaveAttribute('data-status', 'on');
    await page.locator('#setTiltInvert').tap();
    await tilt(page, 3, 14);
    expect(await page.evaluate(() => window.__OT.InputState.tiltSteerVal)).toBeLessThan(-0.3);
    await page.locator('#setTiltRecenter').tap();
    await tilt(page, 3, 14);
    expect(await page.evaluate(() => window.__OT.InputState.tiltSteerVal)).toBe(0);
    expect((await saved(page)).settings.tilt).toBe(true);
    expect(problems).toEqual([]);
  });

  test('a blocked permission says how to fix it and leaves tilt off', async ({ page }) => {
    const problems = watchPage(page);
    await fakeTiltGate(page, 'denied');
    await page.goto(`${APP}?debug`);
    await page.locator('#btnOpenSettings').tap();
    await page.locator('#setTilt').tap();
    await expect(page.locator('#tiltStatus')).toHaveAttribute('data-status', 'denied');
    await expect(page.locator('#tiltStatus')).toContainText(/settings/i);
    await expect(page.locator('#setTilt')).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => window.__OT.InputState.tiltEnabled)).toBe(false);
    expect(problems).toEqual([]);
  });

  test('a device with no tilt sensor is told so instead of silently doing nothing', async ({ page }) => {
    const problems = watchPage(page);
    await fakeTiltGate(page, null);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnOpenSettings').tap();
    await page.locator('#setTilt').tap();
    await expect(page.locator('#tiltStatus')).toHaveAttribute('data-status', 'nosignal', { timeout: 4000 });
    expect(await page.evaluate(() => window.__OT.InputState.tiltEnabled)).toBe(false);
    expect(problems).toEqual([]);
  });
});
