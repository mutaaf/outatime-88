// Sound comes back after an interruption (ticket 0212): a call, Siri or a lock screen leaves
// the AudioContext 'interrupted' on iOS, and a hidden tab leaves it 'suspended'. Returning to
// the tab, a touch or a key wakes it; a player who muted stays muted.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const state = (page) => page.evaluate(() => window.__OT.audio().ctx.state);
const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

// Counts every resume() the game asks for, so "nothing woke it" is checked without a clock.
const countResumes = (page) => page.evaluate(() => {
  const ctx = window.__OT.audio().ctx;
  const real = ctx.resume.bind(ctx);
  window.__resumes = 0;
  ctx.resume = () => { window.__resumes++; delete ctx.state; return real(); }; // drops a faked state
});
const resumes = (page) => page.evaluate(() => window.__resumes);

async function boot(page) {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.audio);
  // Before the first gesture there is no context, and nothing may throw.
  expect(await page.evaluate(() => { window.__OT.audio().wake(); return window.__OT.audio().ctx; })).toBeNull();
  await page.evaluate(() => window.__OT.audio().init()); // the test runs with autoplay allowed
  await expect.poll(() => state(page)).toBe('running');
  return problems;
}

test('a tab that comes back wakes a suspended context; a touch or key wakes an interrupted one', async ({ page }) => {
  const problems = await boot(page);
  // Hidden: the game puts sound to sleep (0032) and nothing wakes it while hidden.
  await setHidden(page, true);
  await expect.poll(() => state(page)).toBe('suspended');
  await countResumes(page);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
  await page.keyboard.press('Shift');
  expect(await resumes(page)).toBe(0);
  expect(await state(page)).toBe('suspended');
  // Back in the tab: it runs again with no tap.
  await setHidden(page, false);
  await expect.poll(() => state(page)).toBe('running');

  // Put to sleep with the tab in view: its own statechange wakes it.
  await page.evaluate(() => window.__OT.audio().ctx.suspend());
  await expect.poll(() => state(page)).toBe('running');
  // An iOS interruption can't be forced in Chromium, so the context reports 'interrupted' and
  // the test checks a real touch and a real key each ask it to resume.
  await page.evaluate(() => {
    window.__resumes = 0;
    Object.defineProperty(window.__OT.audio().ctx, 'state', { configurable: true, get: () => 'interrupted' });
  });
  await page.keyboard.press('Shift');
  expect(await page.evaluate(() => window.__resumes)).toBe(1);
  await expect.poll(() => state(page)).toBe('running');
  await page.evaluate(() => Object.defineProperty(window.__OT.audio().ctx, 'state', { configurable: true, get: () => 'interrupted' }));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
  expect(await page.evaluate(() => window.__resumes)).toBe(2);
  await expect.poll(() => state(page)).toBe('running');
  expect(problems).toEqual([]);
});

test('a player who muted stays silent through a tab switch, a touch and a key', async ({ page }) => {
  const problems = await boot(page);
  await page.evaluate(() => window.__OT.audio().setMuted(true));
  await expect.poll(() => state(page)).toBe('suspended');
  await countResumes(page);
  await setHidden(page, true);
  await setHidden(page, false);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
  await page.keyboard.press('Shift');
  expect(await resumes(page)).toBe(0);
  expect(await state(page)).toBe('suspended');
  // Un-muting is still the player's way back.
  await page.evaluate(() => window.__OT.audio().setMuted(false));
  await expect.poll(() => state(page)).toBe('running');
  expect(problems).toEqual([]);
});

test('a page going away sleeps the sound even while it still reads as visible', async ({ page }) => {
  const problems = await boot(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => state(page)).toBe('suspended');
  // Back (a page restored from the back/forward cache): the tab coming into view wakes it.
  await setHidden(page, false);
  await expect.poll(() => state(page)).toBe('running');
  expect(problems).toEqual([]);
});
