// Ticket 0283: a PlayStation or Switch pad's prompts name that pad's buttons (□ / R1, Y / R…),
// read from the pad in hand when each prompt renders; an Xbox or unknown pad keeps the Xbox
// letters (ceremony.spec.js, pad-hints.spec.js, pause-controls.spec.js cover those unchanged).
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const DUALSENSE = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const SWITCH_PRO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';

/** One connected pad whose id the test can swap (`window.__padId`), as a new pad plugged in. */
const fakePad = (page, id) => page.addInitScript((first) => {
  window.__padId = first;
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(pad, 'id', { get: () => window.__padId });
  navigator.getGamepads = () => [pad];
}, id);
const plugIn = (page, id) => page.evaluate((i) => { window.__padId = i; window.dispatchEvent(new Event('gamepadconnected')); }, id);
const fluxHint = (page) => page.evaluate(() => {
  window.__OT.GameState.fluxCharge = 100;
  return document.getElementById('fluxReadyHint').textContent;
});

test.describe('desktop 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a DualSense: the grid, the flux hint and the pause card name ✕ ○ □ △ and R1 / R2', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, DUALSENSE);
    await page.goto(`${APP}?debug&intro`);
    await page.evaluate(() => window.__OT.ready());
    await plugIn(page, DUALSENSE);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#rcSkip')).toHaveText('PRESS □ TO SKIP ▶▶');
    // Skip without a key or click (either would name its own device): end the lineup by its pill's own path.
    await page.evaluate(() => { window.__OT.InputState.lastInput = 'pad'; });
    await expect(page.locator('#rcHint')).toHaveText('PRESS □ OR R1 RIGHT ON GREEN FOR A ROCKET START', { timeout: 20_000 });
    await page.waitForFunction(() => window.__OT.GameState.racePhase !== 'START');
    await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR □!');

    await page.locator('#btnHudSettings').click();
    const v = (label) => page.locator(`#pauseControls [data-ctl="${label}"]`);
    await expect(page.locator('#pauseControls')).toContainText('GAMEPAD');
    await expect(v('GAS')).toHaveText('✕ · R2');
    await expect(v('GAS')).toHaveAttribute('aria-label', 'Cross or R2');
    await expect(v('BRAKE')).toHaveText('○ · L2');
    await expect(v('WARP')).toHaveText('□ · R1');
    await expect(v('NOS')).toHaveText('L1');
    await expect(v('JUMP')).toHaveText('△');
    await expect(page.locator('#pauseControls [data-aid="pause"]')).toContainText('✕ or START to resume');
    expect(problems).toEqual([]);
  });

  test('a Switch Pro pad gets Nintendo names; a new pad plugged in renames the next prompt', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, SWITCH_PRO);
    await page.goto(`${APP}?debug&intro`);
    await page.evaluate(() => window.__OT.ready());
    await plugIn(page, SWITCH_PRO);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#rcSkip')).toHaveText('PRESS Y TO SKIP ▶▶');
    await page.evaluate(() => { window.__OT.InputState.lastInput = 'pad'; });
    await expect(page.locator('#rcHint')).toHaveText('PRESS Y OR R RIGHT ON GREEN FOR A ROCKET START', { timeout: 20_000 });
    await page.waitForFunction(() => window.__OT.GameState.racePhase !== 'START');
    await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR Y!');
    // Mid-session swap: the Xbox pad takes over and the very next prompt says X again.
    await plugIn(page, XBOX);
    await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR X!');
    await plugIn(page, DUALSENSE);
    await expect.poll(() => fluxHint(page)).toBe('⚡ FLUX READY! HIT 88 MPH OR □!');
    expect(problems).toEqual([]);
  });
});

test.describe('portrait phone 320x568', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test('the DualSense grid prompt stays inside the lights card', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page, DUALSENSE);
    // The lineup already played here, so the race goes straight to the lights (lights-hint-floor.spec.js).
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ lineupsSeen: ['ARCADE:0:'] })));
    await page.goto(`${APP}?debug&intro`);
    await page.evaluate(() => window.__OT.ready());
    await plugIn(page, DUALSENSE);
    await page.evaluate(() => { window.__OT.InputState.lastInput = 'pad'; window.__OT.startRace({ mode: 'ARCADE' }); });
    await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '3', { timeout: 15_000 });
    await expect(page.locator('#rcHint')).toHaveText('PRESS □ OR R1 RIGHT ON GREEN FOR A ROCKET START');
    const fit = await page.evaluate(() => {
      const card = document.getElementById('rcLights').getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('rcHint'));
      const lines = [...r.getClientRects()].map((l) => ({ l: l.left, r: l.right, t: l.top, b: l.bottom }));
      return { card: { l: card.left, r: card.right, t: card.top, b: card.bottom }, lines, vw: innerWidth };
    });
    expect(fit.lines.length).toBeGreaterThan(0);
    expect(fit.card.l).toBeGreaterThanOrEqual(0);
    expect(fit.card.r).toBeLessThanOrEqual(fit.vw);
    for (const l of fit.lines) {
      expect(l.l, JSON.stringify(l)).toBeGreaterThanOrEqual(fit.card.l - 0.5);
      expect(l.r, JSON.stringify(l)).toBeLessThanOrEqual(fit.card.r + 0.5);
      expect(l.t, JSON.stringify(l)).toBeGreaterThanOrEqual(fit.card.t - 0.5);
      expect(l.b, JSON.stringify(l)).toBeLessThanOrEqual(fit.card.b + 0.5);
    }
    expect(problems).toEqual([]);
  });
});
