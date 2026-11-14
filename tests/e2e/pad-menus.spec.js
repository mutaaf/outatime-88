// Ticket 0273: a gamepad drives the menus. D-pad down/right = the next control (like Tab), up/left
// = the previous one, held = repeat; A presses the focused control, B is the menu's own close and
// focus goes back to the opener. In a race the pad pause (0271) still resumes on A unless the
// D-pad moved focus, and while racing the D-pad never touches focus.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
const A = 0, B = 1, START = 9, UP = 12, DOWN = 13;

/** A connected standard pad whose buttons the test holds and lets go (`window.__btn(i, down)`). */
const fakePad = (page) => page.addInitScript((key) => {
  localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
  const btn = () => ({ pressed: false, value: 0 });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
  navigator.getGamepads = () => [pad];
  window.__btn = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
  // A tap held for exactly two game frames (this loop runs before the game's each frame), so a
  // starved runner can never hold it into the 350 ms repeat.
  window.__taps = 0;
  const left = {};
  window.__tap = (i) => { window.__btn(i, true); left[i] = 3; window.__taps++; };
  const loop = () => {
    for (const k in left) if (--left[k] <= 0) { window.__btn(Number(k), false); delete left[k]; window.__taps--; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Count focus moves, so a held D-pad's repeat rate can be measured on the page clock.
  window.__moves = [];
  document.addEventListener('focusin', () => window.__moves.push(performance.now()), true);
}, SAVE_KEY);

const hold = (page, i) => page.evaluate((b) => window.__btn(b, true), i);
const release = (page, i) => page.evaluate((b) => window.__btn(b, false), i);
async function press(page, i) {
  await hold(page, i);
  await nextFrames(page, 3);
  await release(page, i);
  await nextFrames(page, 3);
}
/** One D-pad step = one focus move: a two-frame tap, done once the game has moved focus. */
async function step(page, i) {
  const n = await page.evaluate(() => window.__moves.length);
  await page.evaluate((b) => window.__tap(b), i);
  await page.waitForFunction((k) => window.__moves.length > k && window.__taps === 0, n, { timeout: 10_000 });
  await nextFrames(page, 2);
}
/** Wait until focus stops moving (Settings focuses its DONE once its chunk lands). */
async function settle(page) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => { const a = document.activeElement; return a ? a.id + a.outerHTML.slice(0, 80) : ''; });
    if (now === last) return;
    last = now;
    await nextFrames(page, 5);
  }
}
const status = (page) => page.evaluate(() => window.__OT.GameState.status);
const activeId = (page) => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');

/** The control Tab would reach after the focused one inside `modal`, in document order. */
const tabAfter = (page, modal) => page.evaluateHandle((m) => {
  const root = document.querySelector(m);
  const list = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
    .filter((e) => !e.disabled && e.getAttribute('tabindex') !== '-1' && e.checkVisibility({ visibilityProperty: true }));
  const i = list.indexOf(document.activeElement);
  return list[(i + 1) % list.length];
}, modal);

/** D-pad down until the control matching `sel` has focus (at most `max` steps). */
const focusIs = (page, sel) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
async function downTo(page, sel, max = 80) {
  await settle(page);
  if (!sel.startsWith('#') && !sel.startsWith('[')) sel = `#${sel}`;
  for (let i = 0; i < max && !(await focusIs(page, sel)); i++) await step(page, DOWN);
  expect(await focusIs(page, sel), `D-pad reaches ${sel}`).toBe(true);
}

const homeReady = (page) => page.waitForFunction(() => document.querySelector('#homeHooks')?.childElementCount > 0);

const MENUS = [
  { name: 'Settings', opener: '#btnOpenSettings', modal: '#settingsModal' },
  { name: 'Garage', opener: '#btnOpenGarageFromTitle', modal: '#garageModal' },
  { name: 'Ranks', opener: '#btnOpenLeaderboard', modal: '#leaderboardModal' },
  { name: 'Events', opener: '#btnOpenEvents', modal: '#startModal' },
];

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use(vp.width < 500 ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });

    test('title menus: D-pad walks focus in order, B closes and focus returns to the opener', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await page.goto(`${APP}?debug`);
      await page.evaluate(() => window.__OT.ready());
      await homeReady(page);
      for (const m of MENUS) {
        await page.focus(m.opener);
        await page.locator(m.opener).click();
        await expect(page.locator(m.modal), `${m.name} opens`).toBeVisible();
        await expect.poll(() => page.evaluate((s) => document.querySelector(s).contains(document.activeElement), m.modal)).toBe(true);
        await settle(page);
        for (let i = 0; i < 3; i++) {
          const want = await tabAfter(page, m.modal);
          await step(page, DOWN);
          expect(await page.evaluate((w) => document.activeElement === w, want), `${m.name}: D-pad down ${i + 1} = Tab`).toBe(true);
          expect(await page.evaluate(() => document.activeElement.hasAttribute('data-pad-focus'))).toBe(true);
        }
        const before = await activeId(page) || await page.evaluate(() => document.activeElement.outerHTML.slice(0, 60));
        await step(page, UP);
        await step(page, DOWN);
        expect(await activeId(page) || await page.evaluate(() => document.activeElement.outerHTML.slice(0, 60))).toBe(before);
        await press(page, B);
        await expect(page.locator(m.modal), `${m.name}: B closes`).toBeHidden();
        expect(await page.evaluate((s) => document.activeElement === document.querySelector(s), m.opener), `${m.name}: focus back on the opener`).toBe(true);
        expect(await status(page)).toBe('TITLE'); // B or A never started a race under the menu
        expect(await page.evaluate(() => document.querySelectorAll('[data-pad-focus]').length)).toBe(0);
      }
      expect(await page.evaluate(() => window.__OT.InputState.lastInput)).toBe('pad');
      expect(problems).toEqual([]);
    });

    test('Settings: A flips the focused switch once, even held', async ({ page }) => {
      const problems = watchPage(page);
      await fakePad(page);
      await page.goto(`${APP}?debug`);
      await page.evaluate(() => window.__OT.ready());
      await homeReady(page);
      await page.locator('#btnOpenSettings').click();
      await expect(page.locator('#settingsModal')).toBeVisible();
      await downTo(page, 'setVoice');
      const was = await page.locator('#setVoice').getAttribute('aria-checked');
      await hold(page, A);
      await nextFrames(page, 30);
      await release(page, A);
      await nextFrames(page, 3);
      await expect(page.locator('#setVoice')).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
      await expect(page.locator('#settingsModal')).toBeVisible();
      expect(await status(page)).toBe('TITLE');
      expect(problems).toEqual([]);
    });
  });
}

test.describe('1280x720 pad in a race', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  async function startRace(page) {
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page);
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /race-late-[^/]*\.js/.test(e.name) && e.responseEnd > 0), null, { timeout: 20_000 });
    await nextFrames(page, 4);
  }

  test('pause sheet: D-pad to SETTINGS and A opens it (no resume); B, B closes it and resumes', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await startRace(page);
    // Racing: the D-pad steers and never moves focus.
    await page.evaluate(() => { window.__moves = []; });
    await press(page, DOWN);
    await press(page, UP);
    expect(await page.evaluate(() => window.__moves.length)).toBe(0);
    expect(await status(page)).toBe('PLAYING');

    await press(page, START);
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
    await downTo(page, 'btnSettingsFromGarage');
    await press(page, A);
    await expect(page.locator('#settingsModal')).toBeVisible({ timeout: 15_000 });
    expect(await status(page)).toBe('PAUSED'); // A pressed the focused SETTINGS, it didn't resume
    await press(page, B);
    await expect(page.locator('#settingsModal')).toBeHidden();
    await expect(page.locator('#garageModal')).toBeVisible();
    expect(await status(page)).toBe('PAUSED');
    await press(page, B);
    await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
    await expect(page.locator('#garageModal')).toBeHidden();
    expect(await page.evaluate(() => document.querySelectorAll('[data-pad-focus]').length)).toBe(0);
    expect(problems).toEqual([]);
  });

  test('pause → SETTINGS → STEERING & BUTTONS: the pad drives the controls panel and B closes it', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await startRace(page);
    await press(page, START);
    await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
    await downTo(page, 'btnSettingsFromGarage');
    await press(page, A);
    await expect(page.locator('#settingsModal')).toBeVisible({ timeout: 15_000 });
    await downTo(page, 'btnOpenControls');
    await press(page, A);
    await expect(page.locator('#tcPanel')).toBeVisible({ timeout: 15_000 });
    await step(page, DOWN);
    expect(await page.evaluate(() => document.getElementById('tcPanel').contains(document.activeElement))).toBe(true);
    await press(page, B);
    await expect(page.locator('#tcPanel')).toHaveCount(0);
    expect(await status(page)).toBe('PAUSED');
    expect(problems).toEqual([]);
  });

  test('title → Settings → OPEN RACER: the pad moves inside the racer panel, B closes only it', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await homeReady(page);
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await downTo(page, '[data-open-racer]');
    await press(page, A);
    await expect(page.locator('#racerModal')).toBeVisible({ timeout: 15_000 });
    await step(page, DOWN);
    expect(await page.evaluate(() => document.getElementById('racerModal').contains(document.activeElement))).toBe(true);
    await press(page, B);
    await expect(page.locator('#racerModal')).toBeHidden();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await press(page, A); // A no longer belongs to a hidden panel, and never starts a race under Settings
    expect(await status(page)).toBe('TITLE');
    expect(problems).toEqual([]);
  });

  test('pause sheet: with no D-pad move, A still resumes (0271)', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await startRace(page);
    await press(page, START);
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible({ timeout: 15_000 });
    await press(page, A);
    await expect.poll(() => status(page), { timeout: 10_000 }).toBe('PLAYING');
    expect(problems).toEqual([]);
  });

  test('a held D-pad repeats: one move, then ~350 ms, then every ~120 ms', async ({ page }) => {
    const problems = watchPage(page);
    await fakePad(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await homeReady(page);
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await nextFrames(page, 3);
    await page.evaluate(() => { window.__moves = []; window.__t0 = performance.now(); });
    await hold(page, DOWN);
    await page.waitForFunction(() => window.__moves.length >= 4, null, { timeout: 10_000 });
    await release(page, DOWN);
    const t = await page.evaluate(() => window.__moves.map((m) => m - window.__moves[0]));
    // Frame-quantised on a busy runner: the first repeat waits at least the delay, the next ones less.
    expect(t[1]).toBeGreaterThanOrEqual(330);
    expect(t[2] - t[1]).toBeLessThan(t[1]);
    expect(t[2] - t[1]).toBeGreaterThanOrEqual(100);
    expect(problems).toEqual([]);
  });
});
