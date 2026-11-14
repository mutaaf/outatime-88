// Ticket 0271: a gamepad's START pauses the race and resumes it (with the 3-2-1 beat, 0231);
// A resumes from the pause sheet. Only fresh presses count: a held button acts once, and the
// START that started the race from the title (or the A held as gas) never pauses or resumes.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

/** A connected standard pad whose buttons the test holds and lets go (`window.__btn(i, down)`). */
const fakePad = (page) => page.addInitScript((key) => {
  localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
  const btn = () => ({ pressed: false, value: 0 });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  navigator.getGamepads = () => [pad];
  window.__btn = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
}, SAVE_KEY);

const START = 9, A = 0;
const status = (page) => page.evaluate(() => window.__OT.GameState.status);
const hold = (page, i) => page.evaluate((b) => window.__btn(b, true), i);
const release = (page, i) => page.evaluate((b) => window.__btn(b, false), i);
/** A press the game sees: down for a few frames, then up for a few. */
async function press(page, i) {
  await hold(page, i);
  await nextFrames(page, 4);
  await release(page, i);
  await nextFrames(page, 4);
}

async function expectResumed(page) {
  await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
  await expect(page.locator('#garageModal')).toBeHidden();
  // The 3-2-1 resume beat (0231) runs, then the race drives on.
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat > 0, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat === 0, null, { timeout: 10_000 });
}

async function startRace(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use(vp.width < 500 ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });

    test('START pauses into the pause sheet; held, it toggles once; START again resumes with the beat', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await startRace(page);

      await hold(page, START);
      await expect.poll(() => status(page)).toBe('PAUSED');
      await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 }); // a cold chunk on a starved runner
      // Held across many frames: still paused, the sheet stays up.
      await nextFrames(page, 20);
      expect(await status(page)).toBe('PAUSED');
      await expect(page.locator('#garageModal')).toBeVisible();
      // The pad card names the pause button.
      await expect(page.locator('#garageControls')).toContainText('GAMEPAD');
      await expect(page.locator('#garageControls [data-aid="pause"]')).toContainText('START · PAUSE');
      await release(page, START);
      await nextFrames(page, 4);
      expect(await status(page)).toBe('PAUSED');

      await hold(page, START);
      await expectResumed(page);
      await nextFrames(page, 20); // still held: no second pause
      expect(await status(page)).toBe('PLAYING');
      await release(page, START);
      expect(problems).toEqual([]);
    });

    test('A held as gas never resumes; a fresh A press on the pause sheet does', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await startRace(page);

      await hold(page, A); // flat out
      await press(page, START);
      await expect.poll(() => status(page)).toBe('PAUSED');
      await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
      await nextFrames(page, 20);
      expect(await status(page)).toBe('PAUSED'); // the gas still down is not a press
      await release(page, A);
      await nextFrames(page, 4);
      expect(await status(page)).toBe('PAUSED');
      await hold(page, A);
      await expectResumed(page);
      await release(page, A);
      expect(problems).toEqual([]);
    });
  });
}

test.describe('1280x720 regressions', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('START on the title starts a race, and staying held does not pause it', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await expect(page.locator('#titleScreen')).toBeVisible();
    await hold(page, START);
    await racing(page);
    await nextFrames(page, 20);
    expect(await status(page)).toBe('PLAYING');
    await release(page, START);
    // Let go and pressed again: now it pauses.
    await nextFrames(page, 4);
    await hold(page, START);
    await expect.poll(() => status(page)).toBe('PAUSED');
    await release(page, START);
    expect(problems).toEqual([]);
  });

  test('keyboard Escape still pauses and resumes with a pad connected', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await startRace(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expectResumed(page);
    expect(problems).toEqual([]);
  });
});
