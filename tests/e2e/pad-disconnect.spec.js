// Ticket 0272: a gamepad that drops out mid-race pauses the race (the pause sheet) with a clear
// line saying so; it clears when the player resumes or the pad comes back. Keys/touch untouched.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

/** A pad the test plugs in and pulls (`window.__padIn`), like a Bluetooth link dropping. */
const fakePad = (page) => page.addInitScript((key) => {
  localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
  const btn = () => ({ pressed: false, value: 0 });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  window.__padIn = false;
  navigator.getGamepads = () => (window.__padIn ? [pad] : [null]);
}, SAVE_KEY);

const status = (page) => page.evaluate(() => window.__OT.GameState.status);
const plugIn = (page) => page.evaluate(() => { window.__padIn = true; window.dispatchEvent(new Event('gamepadconnected')); });
const pull = (page) => page.evaluate(() => { window.__padIn = false; window.dispatchEvent(new Event('gamepaddisconnected')); });
const MSG = '#padDrop';

async function startRace(page, pad) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  if (pad) await plugIn(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
}

/** The line fits the sheet and the screen, is never clipped and keeps the 10 px type floor. */
async function expectFits(page) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const shell = el.closest('.garage-shell').getBoundingClientRect();
    return {
      left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth,
      shellL: shell.left, shellR: shell.right,
      font: parseFloat(getComputedStyle(el).fontSize),
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    };
  }, MSG);
  expect(box.font).toBeGreaterThanOrEqual(10);
  expect(box.clipped).toBe(false);
  expect(box.left).toBeGreaterThanOrEqual(Math.max(0, box.shellL));
  expect(box.right).toBeLessThanOrEqual(Math.min(box.w, box.shellR));
  expect(box.bottom - box.top).toBeGreaterThan(0);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use(vp.width < 500 ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });

    test('the pad drops mid-race: paused, the sheet says so, resuming clears it', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await startRace(page, true);
      expect(await page.evaluate(() => window.__OT.InputState.lastInput)).toBe('pad');

      await pull(page);
      await expect.poll(() => status(page)).toBe('PAUSED');
      await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 }); // a cold chunk on a starved runner
      const msg = page.locator(MSG);
      await expect(msg).toBeVisible();
      await expect(msg).toHaveText('🎮 CONTROLLER DISCONNECTED. PRESS ANY BUTTON ON IT, OR USE KEYS / TAP TO CONTINUE');
      await expect(msg).toHaveAttribute('role', 'status');
      await expectFits(page);
      // The pause took the keyboard's path, but the hints aren't told the keys are in hand (a phone keeps touch words).
      expect(await page.evaluate(() => window.__OT.InputState.lastInput)).toBe('');

      // Resume the keyboard way (P / Escape): racing again, the line is gone.
      await page.keyboard.press('Escape');
      await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
      await expect(page.locator('#garageModal')).toBeHidden();
      await expect(msg).toHaveText('');

      // A pause by hand afterwards shows no stale line.
      await page.keyboard.press('Escape');
      await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
      await expect(msg).toBeHidden();
      await page.keyboard.press('Escape');
      await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
      expect(problems).toEqual([]);
    });

    test('the pad comes back while paused: the line says so; a click on close resumes and clears it', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await startRace(page, true);
      await pull(page);
      await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(MSG)).toContainText('CONTROLLER DISCONNECTED');

      await plugIn(page);
      await expect(page.locator(MSG)).not.toContainText('DISCONNECTED');
      await expect(page.locator(MSG)).toContainText('CONTROLLER BACK');
      await expectFits(page);
      expect(await status(page)).toBe('PAUSED'); // reconnecting never drives off on its own

      await page.locator('#btnCloseGarage').click();
      await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
      await expect(page.locator(MSG)).toHaveText('');
      expect(problems).toEqual([]);
    });

    test('keys or touch in hand: a pad dropping out does not pause', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await startRace(page, true);
      // The player put the pad down and drives with the keys / thumbs now.
      await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k })), 'KeyW');
      await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent('keyup', { code: k, key: k })), 'KeyW');
      expect(await page.evaluate(() => window.__OT.InputState.lastInput)).toBe('keys');
      await pull(page);
      await nextFrames(page, 10);
      expect(await status(page)).toBe('PLAYING');
      await expect(page.locator('#garageModal')).toBeHidden();
      expect(problems).toEqual([]);
    });
  });
}

test.describe('outside a race', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test('on the title a pad dropping out does nothing new', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await plugIn(page);
    await pull(page);
    await nextFrames(page, 10);
    expect(await status(page)).not.toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeHidden();
    await expect(page.locator(MSG)).toHaveText('');
    expect(problems).toEqual([]);
  });
});
