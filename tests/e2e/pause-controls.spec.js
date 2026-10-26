// Ticket 0204: pausing shows one compact card of the driving controls for the input in hand:
// the (possibly rebound) keys, the pad's buttons, or the touch pads, and it fits on a phone
// without pushing or covering the pause buttons.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const card = (page, id = 'pauseControls') => page.locator(`#${id}`);
const value = (page, label, id = 'pauseControls') => page.locator(`#${id} [data-ctl="${label}"]`);
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The card sits inside the viewport, clear of the pause buttons, and no cell's text spills out. */
async function expectFits(page, id, buttons) {
  const vp = page.viewportSize();
  const box = await card(page, id).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  for (const sel of buttons) {
    const b = page.locator(sel).first();
    if (!(await b.isVisible())) continue;
    const bb = await b.boundingBox();
    expect(overlaps(box, bb), `${id} overlaps ${sel}`).toBe(false);
  }
  const spill = await page.evaluate((i) => [...document.querySelectorAll(`#${i} .ctl-grid > div`)]
    .filter((d) => d.scrollWidth > d.clientWidth + 1 || [...d.children].some((c) => {
      const r = c.getBoundingClientRect(), o = d.getBoundingClientRect();
      return r.left < o.left - 0.5 || r.right > o.right + 0.5;
    })).map((d) => d.textContent), id);
  expect(spill).toEqual([]);
}

test.describe('keyboard at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the pause names the rebound keys, in the settings pause and the Escape garage pause', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    // Rebind STEER LEFT to U and BOOST to ; on the title; the card is a race thing, not shown there.
    await page.locator('#btnOpenSettings').click();
    await expect(card(page)).toBeHidden();
    await page.locator('[data-key-action="left"]').click();
    await page.keyboard.press('KeyU');
    await page.locator('[data-key-action="boost"]').click();
    await page.keyboard.press('Semicolon');
    await expect(page.locator('[data-key-action="boost"]')).toHaveText(';');
    await page.locator('#btnSettingsDone').click();

    await page.evaluate(() => window.__OT.startRace());
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
    await page.keyboard.press('ArrowUp'); // a key in hand
    await page.locator('#btnHudSettings').click();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('KEYBOARD');
    await expect(value(page, 'STEER')).toHaveText('U D · ← →');
    await expect(value(page, 'GAS')).toHaveText('W · ↑');
    await expect(value(page, 'WARP')).toHaveText(';');
    await expect(value(page, 'NOS')).toHaveText('L-SHIFT · R-SHIFT');
    await expect(value(page, 'JUMP')).toHaveText('H · E');
    await expectFits(page, 'pauseControls', ['#btnSettingsDone', '#settingsModal [data-home]']);
    // A key changed while paused shows on the card at once.
    await page.locator('[data-key-action="right"]').click();
    await page.keyboard.press('KeyO');
    await expect(value(page, 'STEER')).toHaveText('U O · ← →');
    await page.keyboard.press('Escape'); // resumes (focus is in the panel)
    await expect(page.locator('#settingsModal')).toBeHidden();
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');

    // Escape mid-race pauses into the garage sheet: the same card is there.
    await page.keyboard.press('Escape');
    await expect(page.locator('#garageModal')).toBeVisible();
    expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
    await expect(card(page, 'garageControls')).toBeVisible();
    await expect(value(page, 'STEER', 'garageControls')).toHaveText('U O · ← →');
    await expectFits(page, 'garageControls', ['#btnResumeFromGarage', '#btnSettingsFromGarage', '#btnChangeEventFromGarage', '#upgradesList']);
    expect(problems).toEqual([]);
  });

  test('the garage from the title shows no controls card', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#garageModal')).toBeVisible();
    await expect(card(page, 'garageControls')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('with a pad in hand the card names its buttons', async ({ page }) => {
    const problems = watchPage(page);
    await page.addInitScript(() => {
      const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [pad];
    });
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.InputState.lastInput === 'pad');
    await page.locator('#btnHudSettings').dispatchEvent('click'); // no pointer: the pad stays the input in hand
    await expect(card(page)).toContainText('GAMEPAD');
    await expect(value(page, 'GAS')).toHaveText('A · RT');
    await expect(value(page, 'WARP')).toHaveText('X · RB');
    await expect(value(page, 'NOS')).toHaveText('LB');
    await expect(value(page, 'JUMP')).toHaveText('Y');
    expect(problems).toEqual([]);
  });
});

test.describe('touch phone at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the pause names the touch pads and fits above the fold with the pause buttons', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
    await page.locator('#btnHudSettings').tap();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('TOUCH');
    for (const [k, v] of [['WARP', 'WARP'], ['NOS', 'NOS'], ['BRAKE', 'DRIFT'], ['JUMP', 'JUMP']]) await expect(value(page, k)).toHaveText(v);
    await expectFits(page, 'pauseControls', ['#btnSettingsDone', '#settingsModal [data-home]']);
    // The whole card and RESUME are on screen without scrolling the sheet.
    expect(await page.evaluate(() => document.getElementById('settingsModal').scrollTop)).toBe(0);
    const box = await card(page).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    const resume = await page.locator('#btnSettingsDone').boundingBox();
    expect(resume.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: 'test-results/pause-controls-390.png' });
    expect(problems).toEqual([]);
  });

  test('the widest rebound keys still fit each cell at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({
      settings: { keys: { left: 'PageUp', right: 'PageDown', up: 'NumpadDecimal', down: 'NumpadSubtract', boost: 'NumpadMultiply', nos: 'Backslash' } },
    })));
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');
    await page.evaluate(() => { window.__OT.InputState.lastInput = 'keys'; });
    await page.locator('#btnHudSettings').dispatchEvent('click');
    await expect(value(page, 'STEER')).toHaveText('PG UP PG DN · ← →');
    await expectFits(page, 'pauseControls', ['#btnSettingsDone', '#settingsModal [data-home]']);
    expect(problems).toEqual([]);
  });
});
