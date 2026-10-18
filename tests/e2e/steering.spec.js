// Steering-mode shortcuts (ticket 0130): K cycles steering, I the co-pilot, the HUD pill does
// both (tap / hold), the settings panel has a STEERING row, and the choice survives a reload.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

async function race(page) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.steer && window.__OT.steer());
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START');
}
const pill = (page) => page.locator('#btnSteerMode');

test.describe('desktop', () => {
  test('K switches keys ↔ mouse with a toast, and the choice survives a reload', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    await expect(pill(page)).toBeVisible();
    await expect(pill(page)).toHaveAttribute('data-mode', 'keys');
    await page.keyboard.press('KeyK');
    await expect(pill(page)).toHaveAttribute('data-mode', 'mouse');
    await expect(page.locator('#announcerMain')).toContainText('MOUSE');
    await page.keyboard.press('KeyK');
    await expect(pill(page)).toHaveAttribute('data-mode', 'keys');
    await page.keyboard.press('KeyK');
    await page.reload();
    await race(page);
    await expect(pill(page)).toHaveAttribute('data-mode', 'mouse');
    expect(problems).toEqual([]);
  });

  test('mouse mode steers toward the pointer', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    await page.evaluate(() => window.__OT.steer().setMode('mouse', { quiet: true }));
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.5, vp.height * 0.6);
    await page.mouse.move(vp.width * 0.88, vp.height * 0.6, { steps: 4 });
    await expect.poll(() => page.evaluate(() => window.__OT.InputState.mouseSteerVal)).toBeGreaterThan(0.8);
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.steerInput)).toBeGreaterThan(0.3);
    await page.mouse.move(vp.width * 0.5, vp.height * 0.6, { steps: 2 });
    await expect.poll(() => page.evaluate(() => window.__OT.InputState.mouseSteerVal)).toBe(0);
    // Back on keys, the pointer does nothing.
    await page.evaluate(() => window.__OT.steer().setMode('keys', { quiet: true }));
    await page.mouse.move(vp.width * 0.1, vp.height * 0.6, { steps: 3 });
    expect(await page.evaluate(() => window.__OT.InputState.mouseSteerVal)).toBe(0);
    expect(problems).toEqual([]);
  });

  test('I cycles the co-pilot; the pill tap cycles steering and a right-click opens the picker', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    const jarvis = () => page.evaluate(() => window.__OT.GameState.jarvisMode);
    expect(await jarvis()).toBe(2); // ASSIST OFF
    await page.keyboard.press('KeyI');
    expect(await jarvis()).toBe(0); // SMART ASSIST
    await page.keyboard.press('KeyI');
    expect(await jarvis()).toBe(1); // AUTOPILOT
    await expect(pill(page)).toHaveAttribute('data-assist', 'auto');
    await pill(page).click();
    await expect(pill(page)).toHaveAttribute('data-mode', 'mouse');
    await pill(page).click({ button: 'right' });
    const picker = page.locator('#steerPicker');
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-steer-mode="mouse"]')).toHaveAttribute('aria-pressed', 'true');
    await picker.locator('[data-assist="off"]').click();
    await expect(picker).toBeHidden();
    expect(await jarvis()).toBe(2);
    await expect(pill(page)).toHaveAttribute('data-assist', 'off');
    expect(problems).toEqual([]);
  });

  test('the settings panel STEERING row switches mode and co-pilot', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    await page.locator('#btnHudSettings').click();
    const modal = page.locator('#settingsModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-steer-mode="tilt"]')).toBeHidden(); // no tilt on a laptop
    await expect(modal.locator('[data-steer-mode="keys"]')).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('[data-steer-mode="mouse"]').click();
    await expect(modal.locator('[data-steer-mode="mouse"]')).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('[data-assist="assist"]').click();
    expect(await page.evaluate(() => window.__OT.GameState.jarvisMode)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).settings)).toMatchObject({ steer: 'mouse', assist: 'assist' });
    expect(problems).toEqual([]);
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
  test('the pill cycles joystick → D-pad and the touch kit follows', async ({ page }) => {
    const problems = watchPage(page);
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
    await race(page);
    await expect(pill(page)).toHaveAttribute('data-mode', 'stick');
    await pill(page).tap();
    await expect(pill(page)).toHaveAttribute('data-mode', 'dpad');
    await expect(page.locator('#tcDpad')).toBeVisible();
    await expect(page.locator('#tcStick')).toBeHidden();
    expect(await page.evaluate(() => window.__OT.controls().movement)).toBe('dpad');
    await page.evaluate(() => window.__OT.steer().setMode('stick', { quiet: true }));
    await expect(page.locator('#tcStick')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
