// Ticket 0304: Alt-Tab, a click into another window or a chat popup takes focus without hiding
// the tab, so the 0032 hidden-tab pause never ran and the keyup went to the other window: a key
// held at that moment stayed held. Losing focus now releases every held key, in every mode, and
// pauses a solo race with the panel up (RESUME). Focus coming back never resumes by itself.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames, racing } from './helpers.js';

test.use({ viewport: { width: 1280, height: 720 } });

/** A campaign race (Endless can end on a hazard any second), past the lights. */
async function race(page, query = '?debug') {
  await page.goto(`${APP}${query}`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
}

const input = (page) => page.evaluate(() => {
  const i = window.__OT.InputState;
  return { left: i.left, right: i.right, up: i.up, down: i.down, nos: i.nosHeld || Boolean(i.nosOn), wheel: i.wheelDragActive || i.wheelSteerVal !== 0 };
});
const blur = (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const status = (page) => page.evaluate(() => window.__OT.GameState.status);

test('solo race: blur pauses with RESUME up and lets go of the held gas; focus does not resume', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ShiftLeft');
  await nextFrames(page);
  expect(await input(page)).toMatchObject({ up: true, left: true, nos: true });

  await blur(page);
  await expect.poll(() => status(page)).toBe('PAUSED');
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#btnSettingsDone')).toHaveText(/RESUME/);
  expect(await input(page)).toEqual({ left: false, right: false, up: false, down: false, nos: false, wheel: false });

  // Coming back to the window is not a tap on RESUME.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await nextFrames(page, 10);
  expect(await status(page)).toBe('PAUSED');

  // RESUME: the 3-2-1 beat (0231) plays, then the car is not driving on a key nobody holds.
  await page.locator('#btnSettingsDone').click();
  await expect.poll(() => status(page)).toBe('PLAYING');
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat > 0, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat === 0, null, { timeout: 10_000 });
  await nextFrames(page, 5);
  expect(await input(page)).toEqual({ left: false, right: false, up: false, down: false, nos: false, wheel: false });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  expect(problems).toEqual([]);
});

test('live race: blur keeps it running (friends are still driving) but releases the held keys', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  // A live room can't pause (settings-ui openSettings); stand in for one on the running race.
  await page.evaluate(() => { window.__OT.GameState.mode = 'LIVE'; });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ShiftRight');
  // A tapped-on NOS (0222) and a wheel drag whose pointerup lands in the other window stop too.
  await page.evaluate(() => { const i = window.__OT.InputState; i.nosOn = true; i.wheelDragActive = true; i.wheelSteerVal = 0.8; });
  await nextFrames(page);
  expect(await input(page)).toMatchObject({ right: true, down: true, nos: true, wheel: true });

  await blur(page);
  await nextFrames(page, 5);
  expect(await status(page)).toBe('PLAYING');
  await expect(page.locator('#settingsModal')).toBeHidden();
  expect(await input(page)).toEqual({ left: false, right: false, up: false, down: false, nos: false, wheel: false });
  await page.keyboard.up('ShiftRight');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowRight');
  expect(problems).toEqual([]);
});

test('already paused: blur leaves the pause as it is but still lets go of a held key', async ({ page }) => {
  await race(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => status(page)).toBe('PAUSED');
  await page.keyboard.down('ArrowLeft');
  await nextFrames(page);
  expect(await input(page)).toMatchObject({ left: true });
  await blur(page);
  await nextFrames(page, 3);
  expect(await status(page)).toBe('PAUSED');
  await expect(page.locator('#settingsModal')).toBeHidden(); // the garage pause sheet stays the one up
  expect(await input(page)).toMatchObject({ left: false });
  await page.keyboard.up('ArrowLeft');
});

test('TV screen: blur never pauses (the phone is the pad and its own button pauses) but releases keys', async ({ page }) => {
  await race(page, '?tv&debug');
  await page.keyboard.down('ArrowUp');
  await nextFrames(page);
  expect(await input(page)).toMatchObject({ up: true });
  await blur(page);
  await nextFrames(page, 5);
  expect(await status(page)).toBe('PLAYING');
  await expect(page.locator('#settingsModal')).toBeHidden();
  expect(await input(page)).toMatchObject({ up: false });
  await page.keyboard.up('ArrowUp');
});
