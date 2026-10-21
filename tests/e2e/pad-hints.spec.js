// Ticket 0007: with a gamepad connected, the in-race prompts name the pad's buttons, and a
// disconnect puts the keyboard words back. Keyboard play is unchanged.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const fakePad = (page) => page.addInitScript(() => {
  const btn = () => ({ pressed: false, value: 0 });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  window.__padIn = true;
  navigator.getGamepads = () => (window.__padIn ? [pad] : [null]);
});
// Flux full while stopped at the line: the HUD's flux line names the warp control.
const fluxHint = (page) => page.evaluate(() => {
  window.__OT.GameState.fluxCharge = 100;
  return document.getElementById('fluxReadyHint').textContent;
});
const shownSteer = (page) => page.evaluate(() => [...document.querySelectorAll('#steerHint span')]
  .filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent).join('|'));

test.use({ viewport: { width: 1280, height: 720 } });

test('a connected pad: steer prompt and flux hint name the pad, a disconnect restores the keys', async ({ page }) => {
  const problems = watchPage(page);
  await fakePad(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  expect(await shownSteer(page)).toBe('◀ STICK / D-PAD TO STEER ▶');
  await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR X!');

  await page.evaluate(() => { window.__padIn = false; window.dispatchEvent(new Event('gamepaddisconnected')); });
  expect(await shownSteer(page)).toBe('◀ A / D TO STEER ▶');
  await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR SPACE!');
  expect(problems).toEqual([]);
});

test('no pad: keyboard prompts are unchanged', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.keyboard.press('Enter');
  await racing(page);
  await expect(page.locator('#steerHint')).toBeVisible({ timeout: 3000 });
  expect(await shownSteer(page)).toBe('◀ A / D TO STEER ▶');
  await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR SPACE!');
  expect(await page.evaluate(() => document.body.classList.contains('input-pad'))).toBe(false);
  expect(problems).toEqual([]);
});
