// Ticket 0222: Settings → NOS = TAP ON/OFF. One tap of Shift / the touch NOS button burns NOS with
// nothing held; the next tap stops it. A crash, a warp and a pause turn it off by themselves.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait, touchReady } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

async function race(page, nos = 'toggle') {
  await page.addInitScript(([key, mode]) => {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true }, settings: { nos: mode } }));
  }, [SAVE_KEY, nos]);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await racing(page);
  // Fast, and no crash can cut the burn by accident (invulnerable hits never reach the cut).
  await page.evaluate(() => { const g = window.__OT.GameState; g.invulnTimer = 60; g.speed = Math.max(g.speed, 80); });
}

/** Watch every step-ish moment for NOS going out while the race runs; returns a stop() reader. */
function watchOut(page) {
  return page.evaluate(() => {
    const g = window.__OT.GameState;
    window.__nosOut = 0;
    window.__nosWatch = setInterval(() => { if (g.status === 'PLAYING' && !g.nosBurning) window.__nosOut++; }, 2);
  });
}
const stopWatch = (page) => page.evaluate(() => { clearInterval(window.__nosWatch); return window.__nosOut; });
/** Fill the tank (two NOS canisters): a starved runner can step a lot of burn between two checks. */
const refill = (page) => page.evaluate(() => { window.__OT.pickup('NOS_CAN'); window.__OT.pickup('NOS_CAN'); });
const burning = (page) => page.evaluate(() => window.__OT.GameState.nosBurning);

test('keys: a quick tap of Shift burns NOS with the key up; the next tap stops it; a crash stops it', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await refill(page);
  await page.keyboard.press('Shift'); // down and up in one go: the press itself must register
  await page.waitForFunction(() => window.__OT.GameState.nosBurning, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__OT.input.nosHeld)).toBe(false); // nothing is held
  await watchOut(page);
  expect(await simWait(page, 0.4)).toBe(true);
  expect(await stopWatch(page)).toBe(0); // burning the whole time, key up
  await expect(page.locator('#hudSpeedCard')).toHaveClass(/is-nos/);

  await page.keyboard.press('Shift');
  await page.waitForFunction(() => !window.__OT.GameState.nosBurning && !window.__OT.input.nosOn, null, { timeout: 15000 });
  await simWait(page, 0.3);
  expect(await burning(page)).toBe(false); // stays off

  // On again, then a crash that gets through turns it off.
  await refill(page);
  await page.keyboard.press('N');
  await page.waitForFunction(() => window.__OT.GameState.nosBurning, null, { timeout: 15000 });
  await page.evaluate(() => { window.__OT.GameState.invulnTimer = 0; window.__OT.damage(8, 'BARREL IMPACT'); });
  await page.waitForFunction(() => !window.__OT.input.nosOn, null, { timeout: 15000 });
  await simWait(page, 0.3);
  expect(await burning(page)).toBe(false);
  expect(problems).toEqual([]);
});

test('keys: pausing turns a tapped-on NOS off, and the pause card says NOS is TAP ON/OFF', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await page.keyboard.press('ShiftRight');
  await page.waitForFunction(() => window.__OT.GameState.nosBurning, null, { timeout: 15000 });
  await page.locator('#btnHudSettings').click();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
  await expect.poll(() => page.evaluate(() => Boolean(window.__OT.input.nosOn))).toBe(false);
  await expect(page.locator('#pauseControls [data-aid="nos"]')).toContainText('NOS TAP ON/OFF');
  await expect(page.locator('#settingsModal [data-setting="nos"] [data-value="toggle"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnSettingsDone').click();
  await racing(page);
  await simWait(page, 0.3);
  expect(await burning(page)).toBe(false);
  expect(problems).toEqual([]);
});

test('pad: LB going down toggles NOS; holding LB through the burn does not flip it back', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => {
    const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__lb = (on) => { pad.buttons[4] = { pressed: on, touched: on, value: on ? 1 : 0 }; pad.timestamp++; };
    navigator.getGamepads = () => [pad];
  });
  await race(page);
  await refill(page);
  await page.evaluate(() => window.__lb(true));
  await page.waitForFunction(() => window.__OT.GameState.nosBurning, null, { timeout: 15000 });
  await watchOut(page);
  expect(await simWait(page, 0.3)).toBe(true); // LB still down
  await page.evaluate(() => window.__lb(false));
  expect(await simWait(page, 0.3)).toBe(true); // and up
  expect(await stopWatch(page)).toBe(0);
  await page.evaluate(() => window.__lb(true));
  await page.waitForFunction(() => !window.__OT.GameState.nosBurning && !window.__OT.input.nosOn, null, { timeout: 15000 });
  await page.evaluate(() => window.__lb(false));
  expect(problems).toEqual([]);
});

test('HOLD (the default) is unchanged: a quick tap gives no lasting burn and the card has no NOS note', async ({ page }) => {
  const problems = watchPage(page);
  await race(page, 'hold');
  await page.keyboard.press('Shift');
  await simWait(page, 0.3);
  expect(await burning(page)).toBe(false);
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#pauseControls')).toBeVisible();
  await expect(page.locator('#pauseControls [data-aid="nos"]')).toHaveCount(0);
  await expect(page.locator('#settingsModal [data-setting="nos"] [data-value="hold"]')).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap of the touch NOS button burns until the next tap, and the button says NOS ON', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    await touchReady(page);
    const horn = page.locator('#tcHorn');
    await expect(horn).toBeVisible();
    await refill(page);
    await horn.tap();
    await page.waitForFunction(() => window.__OT.GameState.nosBurning, null, { timeout: 15000 });
    await expect(horn.locator('.tc-lbl')).toHaveText('NOS ON');
    await expect(horn).toHaveAttribute('aria-label', 'NOS on');
    await watchOut(page);
    expect(await simWait(page, 0.4)).toBe(true);
    expect(await stopWatch(page)).toBe(0); // no finger on it
    await page.screenshot({ path: test.info().outputPath('nos-on-390.png') });

    await horn.tap();
    await page.waitForFunction(() => !window.__OT.GameState.nosBurning, null, { timeout: 15000 });
    await expect(horn.locator('.tc-lbl')).toHaveText('NOS');
    expect(problems).toEqual([]);
  });
});
