// Ticket 0298: Settings → GAMEPAD BUTTONS rebinds the pad's five driving buttons (GAS, BRAKE,
// WARP, JUMP, NOS). A button another action holds is refused in plain words, START cancels, RESET
// brings the defaults back, the binding persists, and the prompts and the pause card name it.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
const A = 0, B = 1, X = 2, RB = 5, START = 9, RS = 11, DOWN = 13;
const DUALSENSE = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';

/** A connected pad (`id`) and a save with `settings`; `window.__tap(i)` holds a button for three frames. */
const fakePad = (page, { settings = {}, id = XBOX } = {}) => page.addInitScript(([key, s, padId]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true }, settings: s }));
    sessionStorage.setItem('seeded', '1'); // a reload keeps what the page saved
  }
  const pad = { id: padId, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [pad];
  window.__btn = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
  window.__taps = 0;
  const left = {};
  window.__tap = (i) => { window.__btn(i, true); left[i] = 3; window.__taps++; };
  const loop = () => {
    for (const k in left) if (--left[k] <= 0) { window.__btn(Number(k), false); delete left[k]; window.__taps--; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, [SAVE_KEY, settings, id]);

async function tap(page, i) {
  await page.evaluate((b) => window.__tap(b), i);
  await page.waitForFunction(() => window.__taps === 0);
  await nextFrames(page, 3);
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings.padMap, SAVE_KEY);
const row = (page, id) => page.locator(`[data-pad-action="${id}"]`);
const note = (page) => page.locator('#setPadNote');

/** Primes a warp that only a boost press can fire (speed under 88, so no auto-warp), presses `button`, says if it warped. */
async function warpsOn(page, button) {
  const before = await page.evaluate(() => {
    const g = window.__OT.GameState;
    g.fluxCharge = 100; g.speed = 40; g.sinceWarp = 99; g.warpActiveTimer = 0; g.invulnTimer = 5;
    return g.timeWarps;
  });
  await tap(page, button);
  await nextFrames(page, 4);
  return page.evaluate((b) => window.__OT.GameState.timeWarps > b, before);
}

test.describe('desktop 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('rebind WARP to RS: refusal, the race obeys it, it persists, RESET restores', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').click();
    await expect(row(page, 'boost')).toHaveText('X');
    await expect(page.locator('[data-pad-also="boost"]')).toHaveText('also RB');
    await expect(page.locator('[data-pad-also="gas"]')).toHaveText('also RT');

    // Keyboard reaches the row: focus it and press Enter to start the capture.
    await row(page, 'boost').focus();
    await page.keyboard.press('Enter');
    await expect(row(page, 'boost')).toHaveText('PRESS A BUTTON…');
    await expect(row(page, 'boost')).toHaveAttribute('aria-pressed', 'true');
    await tap(page, B); // taken by BRAKE: refused, still waiting, Settings stays open
    await expect(note(page)).toHaveText('B is already BRAKE. Pick another button, or press START to cancel.');
    await expect(row(page, 'boost')).toHaveText('PRESS A BUTTON…');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await tap(page, RS);
    await expect(row(page, 'boost')).toHaveText('RS');
    await expect(page.locator('[data-pad-also="boost"]')).toHaveText('');
    await expect(note(page)).toHaveText('WARP is RS now.');
    expect(await saved(page)).toEqual({ gas: 0, brake: 1, boost: 11, jump: 3, nos: 4 });
    await page.screenshot({ path: 'test-results/pad-remap-1280.png' });
    await page.locator('#btnSettingsDone').click();

    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page);
    expect(await warpsOn(page, X), 'X no longer warps').toBe(false);
    expect(await warpsOn(page, RB), 'RB no longer warps').toBe(false);
    await expect.poll(() => warpsOn(page, RS), { message: 'RS warps', timeout: 10_000 }).toBe(true);

    // The pause card names the rebound button.
    await page.locator('#btnHudSettings').click();
    await expect(page.locator('#pauseControls [data-ctl="WARP"]')).toHaveText('RS');
    await expect(page.locator('#pauseControls [data-ctl="GAS"]')).toHaveText('A · RT');

    // A reload keeps it: the panel's chunk applies it at boot.
    await page.reload();
    await page.waitForFunction(() => JSON.stringify(window.__OT && window.__OT.InputState.padMap) === '[0,1,11,-1,3,4]');
    await page.locator('#btnOpenSettings').click();
    await expect(row(page, 'boost')).toHaveText('RS');
    await page.locator('#setPadReset').click();
    await expect(row(page, 'boost')).toHaveText('X');
    await expect(note(page)).toHaveText('Default buttons back.');
    expect(await saved(page)).toBe(null);
    expect(await page.evaluate(() => window.__OT.InputState.padMap)).toBe(null);
    expect(problems).toEqual([]);
  });

  test('the pad alone: D-pad to the row, A starts, B is refused not "close", START cancels', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#btnSettingsDone')).toBeFocused();
    for (let i = 0; i < 80 && !(await row(page, 'jump').evaluate((e) => e === document.activeElement)); i++) {
      const n = await page.evaluate(() => document.activeElement && document.activeElement.outerHTML);
      await tap(page, DOWN);
      await page.waitForFunction((o) => document.activeElement && document.activeElement.outerHTML !== o, n).catch(() => {});
    }
    await expect(row(page, 'jump')).toBeFocused();
    await tap(page, A); // presses the focused row; that A must be let go before it can count
    await expect(row(page, 'jump')).toHaveText('PRESS A BUTTON…');
    await tap(page, B);
    await expect(note(page)).toContainText('B is already BRAKE');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await tap(page, START);
    await expect(note(page)).toHaveText('Kept JUMP as it was.');
    await expect(row(page, 'jump')).toHaveText('Y');
    expect(await saved(page)).toBe(null);
    // Once the capture is over the pad drives the menu again: A starts a new capture, RB binds.
    await tap(page, A);
    await expect(row(page, 'jump')).toHaveText('PRESS A BUTTON…');
    await tap(page, RB);
    await expect(row(page, 'jump')).toHaveText('RB');
    await expect(page.locator('[data-pad-also="boost"]')).toHaveText(''); // RB is JUMP's now, not a second WARP
    expect(await saved(page)).toEqual({ gas: 0, brake: 1, boost: 2, jump: 5, nos: 4 });
    expect(problems).toEqual([]);
  });

  test('a DualSense with WARP on RS: the grid and the pause card say R3', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, { id: DUALSENSE, settings: { padMap: { boost: 11 } } });
    await page.goto(`${APP}?debug&intro`);
    await page.evaluate(() => window.__OT.ready());
    await page.waitForFunction(() => Array.isArray(window.__OT.InputState.padMap));
    await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#rcSkip')).toHaveText('PRESS R3 TO SKIP ▶▶');
    await page.evaluate(() => { window.__OT.InputState.lastInput = 'pad'; });
    await expect(page.locator('#rcHint')).toHaveText('PRESS R3 RIGHT ON GREEN FOR A ROCKET START', { timeout: 20_000 });
    await page.waitForFunction(() => window.__OT.GameState.racePhase !== 'START');
    await page.locator('#btnHudSettings').click();
    await expect(page.locator('#pauseControls [data-ctl="WARP"]')).toHaveText('R3');
    await expect(page.locator('#pauseControls [data-ctl="JUMP"]')).toHaveText('△');
    expect(problems).toEqual([]);
  });

  test('a corrupt padMap loads as the defaults', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, { settings: { padMap: { boost: 'RB', jump: 99, nos: [1] } } });
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').click();
    await expect(row(page, 'boost')).toHaveText('X');
    await expect(row(page, 'jump')).toHaveText('Y');
    await expect(row(page, 'nos')).toHaveText('LB');
    expect(await page.evaluate(() => window.__OT.InputState.padMap)).toBe(null);
    expect(problems).toEqual([]);
  });
});

test.describe('portrait phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the GAMEPAD BUTTONS rows fit and are 44 px tall', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.locator('#btnOpenSettings').tap();
    await row(page, 'nos').scrollIntoViewIfNeeded();
    for (const id of ['gas', 'brake', 'boost', 'jump', 'nos']) {
      const b = await row(page, id).boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    await page.locator('#setHeadPad').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/pad-remap-390.png' });
    expect(problems).toEqual([]);
  });
});
