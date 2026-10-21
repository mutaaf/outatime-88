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
  await page.locator('#setVoice').click();
  await page.locator('#setMusic').fill('30');
  await page.keyboard.press('Enter'); // focus is in the panel: Enter must not start a race
  expect(await page.evaluate(() => window.__OT.GameState.status)).not.toBe('PLAYING');
  await page.locator('#btnSettingsDone').click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  expect((await saved(page)).settings).toMatchObject({ difficulty: 'hard', motion: 'reduce', musicVolume: 0.3, voice: false });
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

// Ticket 0013: rebindable keyboard keys. Tap an action, press its key; conflicts are refused;
// the binding survives a reload and drives the car; the arrows always steer too.
test('a rebound key persists across a reload and drives the action', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnOpenSettings').click();
  const left = page.locator('[data-key-action="left"]');
  const right = page.locator('[data-key-action="right"]');
  const boost = page.locator('[data-key-action="boost"]');
  await expect(left).toHaveText('A');
  await expect(boost).toHaveText('SPACE');
  for (const b of await page.locator('#setKeys button, #setKeysReset').all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }

  await left.click();
  await expect(left).toHaveText(/PRESS A KEY/);
  await page.keyboard.press('KeyL');
  await expect(left).toHaveText('L');
  await expect(page.locator('#setKeysNote')).toContainText('STEER LEFT is L');
  // A conflict is refused and changes nothing.
  await right.click();
  await page.keyboard.press('KeyL');
  await expect(page.locator('#setKeysNote')).toContainText('L is already STEER LEFT');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#setKeysNote')).toContainText('M is a game key');
  await right.click(); // a second tap cancels
  await expect(right).toHaveText('D');
  // BOOST on O: Space's keyup must not click the button and start capturing again.
  await boost.click();
  await page.keyboard.press('KeyO');
  await expect(boost).toHaveText('O');
  await expect(boost).toHaveAttribute('aria-pressed', 'false');
  expect((await saved(page)).settings.keys).toMatchObject({ left: 'KeyL', right: 'KeyD', boost: 'KeyO' });
  await page.locator('#btnSettingsDone').click();

  await page.reload();
  await page.waitForFunction(() => window.__OT.InputState.keyMap && window.__OT.InputState.keyMap.KeyL === 'KeyA');
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
  const input = () => page.evaluate(() => ({ left: window.__OT.InputState.left, boost: window.__OT.InputState.boostPressed }));
  await page.keyboard.down('KeyL');
  expect((await input()).left).toBe(true);
  await page.keyboard.up('KeyL');
  expect((await input()).left).toBe(false);
  await page.keyboard.down('KeyA'); // the old key is free now
  expect((await input()).left).toBe(false);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('ArrowLeft'); // the arrows always steer
  expect((await input()).left).toBe(true);
  await page.keyboard.up('ArrowLeft');
  expect(await page.evaluate(() => window.__OT.InputState.boostKey)).toBe('O');

  // Back to the defaults from the panel; A steers again.
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('[data-key-action="left"]')).toHaveText('L');
  await page.locator('#setKeysReset').click();
  await expect(page.locator('[data-key-action="left"]')).toHaveText('A');
  expect((await saved(page)).settings.keys).toBeNull();
  expect(await page.evaluate(() => window.__OT.InputState.keyMap)).toBeNull();
  await page.locator('#btnSettingsDone').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && !document.querySelector('#settingsModal').contains(document.activeElement));
  await page.keyboard.down('KeyA');
  expect((await input()).left).toBe(true);
  await page.keyboard.up('KeyA');
  expect(problems).toEqual([]);
});
