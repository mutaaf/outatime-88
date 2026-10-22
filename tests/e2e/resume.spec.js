// Pause → resume never leaves the race frozen, whichever way you paused, and a thumb that
// goes down during the start lights is the stick once the race goes green.
import { test, expect } from '@playwright/test';
import { APP, watchPage, touchReady, nextFrames } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function race(page, query = '?debug') {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
      sessionStorage.setItem('seeded', '1');
    }
    // Frames keep coming: count animation frames the page actually runs.
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  }, SAVE_KEY);
  await page.goto(`${APP}${query}`);
  await page.evaluate(() => window.__OT.startRace());
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  await touchReady(page); // the touch kit is its own chunk: the stick isn't there until it lands
}

const status = (page) => page.evaluate(() => window.__OT.GameState.status);
const progress = (page) => page.evaluate(() => ({ d: window.__OT.GameState.distance, f: window.__frames }));

/** Paused for 5 s, then resumed: the race moves again and frames keep coming. */
async function expectRunsAfterResume(page, resume) {
  expect(await status(page)).toBe('PAUSED');
  const p0 = await progress(page);
  await page.waitForTimeout(5000);
  const p1 = await progress(page);
  expect(p1.d).toBeCloseTo(p0.d, 3); // frozen while paused
  await resume();
  await expect.poll(() => status(page)).toBe('PLAYING');
  const p2 = await progress(page);
  await page.waitForTimeout(800);
  const p3 = await progress(page);
  expect(p3.d - p2.d).toBeGreaterThan(5);
  expect(p3.f - p2.f).toBeGreaterThan(3); // CI's software GPU draws ~10 fps
}

const resumeButton = (page) => () => page.locator('#btnSettingsDone').tap();

test('gear → RESUME', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await expect(page.locator('#btnSettingsDone')).toHaveText(/RESUME/);
  await expectRunsAfterResume(page, resumeButton(page));
  expect(problems).toEqual([]);
});

test('gear, then the back gesture, then RESUME', async ({ page }) => {
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await expect(page.locator('#settingsModal')).toBeVisible(); // open before the back gesture
  await page.goBack();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expectRunsAfterResume(page, resumeButton(page));
});

test('gear → STEERING & BUTTONS → DONE → RESUME', async ({ page }) => {
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await page.locator('#btnOpenControls').tap();
  await page.locator('#tcPanel [data-act="done"]').first().tap();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expectRunsAfterResume(page, resumeButton(page));
});

test('gear → EDIT CONTROLS → save → RESUME', async ({ page }) => {
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await page.locator('#btnEditControls').tap();
  await page.locator('.tc-edit-done').tap();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expectRunsAfterResume(page, resumeButton(page));
});

test('paused, rotated, then resumed', async ({ page }) => {
  await race(page);
  await page.locator('#btnHudSettings').tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await expectRunsAfterResume(page, resumeButton(page));
});

test('the P key pauses (garage) and P resumes', async ({ page }) => {
  await race(page);
  await page.keyboard.press('KeyP');
  await expectRunsAfterResume(page, () => page.keyboard.press('KeyP'));
});

test('leaving the app mid-race pauses; coming back offers RESUME and it resumes', async ({ page }) => {
  await race(page);
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await setHidden(false);
  await expect(page.locator('#btnSettingsDone')).toHaveText(/RESUME/);
  await expectRunsAfterResume(page, resumeButton(page));
});

test('a thumb held down during the start lights steers after GO without lifting', async ({ page }) => {
  await race(page, '?debug&intro');
  const skip = page.locator('#rcSkip');
  if (await skip.isVisible()) await skip.tap();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.racePhase)).toBe('START');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 1, radiusX: 8, radiusY: 8, force: 1 })) });
  await touch('touchStart', [{ x: 90, y: 680 }]);
  await expect(page.locator('#tcStick')).toHaveClass(/tc-engaged/);
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.racePhase), { timeout: 10_000 }).toBe('RACING');
  for (let i = 1; i <= 15; i++) await touch('touchMove', [{ x: 90 + i * 4, y: 680 }]);
  await expect.poll(() => page.evaluate(() => window.__OT.input.touchSteerVal)).toBeGreaterThan(0.5);
  await touch('touchEnd', []);
});

test('dragging the thumbstick: the knob follows the finger and steering is proportional', async ({ page }) => {
  await race(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 1, radiusX: 8, radiusY: 8, force: 1 })) });
  const knob = () => page.evaluate(() => {
    const r = document.querySelector('#tcStick .tc-stick-knob').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const steer = () => page.evaluate(() => window.__OT.input.touchSteerVal);
  const x0 = 100; const y0 = 660;
  await touch('touchStart', [{ x: x0, y: y0 }]);
  const seen = [];
  for (const dx of [10, 20, 30, 40, 80]) {
    await touch('touchMove', [{ x: x0 + dx, y: y0 }]);
    await page.waitForTimeout(250); // smoothing settles
    seen.push({ dx, knob: await knob(), steer: await steer() });
  }
  // The knob sits under the finger until the ring's edge, then the ring follows the thumb.
  expect(Math.abs(seen[0].knob.x - (x0 + 10))).toBeLessThan(3);
  expect(Math.abs(seen[2].knob.x - (x0 + 30))).toBeLessThan(3);
  expect(Math.abs(seen[4].knob.x - (x0 + 80))).toBeLessThan(3);
  // Analog: more deflection steers harder, full past the edge.
  expect(seen[1].steer).toBeGreaterThan(seen[0].steer);
  expect(seen[3].steer).toBeGreaterThan(seen[1].steer);
  expect(seen[1].steer).toBeLessThan(0.95);
  expect(seen[4].steer).toBeGreaterThan(0.95);
  // Back left past where the ring was dragged to: steers left at once, no need to lift.
  await touch('touchMove', [{ x: x0 - 10, y: y0 }]);
  await expect.poll(steer).toBeLessThan(-0.3);
  await touch('touchEnd', []);
  await expect.poll(async () => Math.abs(await steer())).toBeLessThan(0.01);
});

test('the HUD growing mid-race (first points wrap the speed card) never drops a held thumb', async ({ page }) => {
  await race(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 1, radiusX: 8, radiusY: 8, force: 1 })) });
  const steer = () => page.evaluate(() => window.__OT.input.touchSteerVal);
  const engaged = () => page.evaluate(() => document.querySelector('#tcStick').classList.contains('tc-engaged'));
  const zoneTop = () => page.evaluate(() => new DOMMatrix(document.querySelector('#tcZoneHint').style.transform).m42);
  const top0 = await zoneTop();
  await touch('touchStart', [{ x: 100, y: 660 }]);
  await touch('touchMove', [{ x: 160, y: 660 }]);
  await expect.poll(steer).toBeGreaterThan(0.5);
  // The header grows the way it does on a phone once the score's text wraps under WARP READY.
  await page.evaluate(() => { const h = document.querySelector('header'); h.style.minHeight = `${h.getBoundingClientRect().height + 24}px`; });
  await nextFrames(page, 4);
  expect(await engaged()).toBe(true);
  expect(await steer()).toBeGreaterThan(0.5);
  await touch('touchMove', [{ x: 170, y: 660 }]);
  await nextFrames(page, 2);
  expect(await engaged()).toBe(true);
  expect(await steer()).toBeGreaterThan(0.5);
  // Lifting the thumb lets the controls catch up with the taller HUD.
  await touch('touchEnd', []);
  await expect.poll(async () => Math.abs(await steer())).toBeLessThan(0.01);
  await expect.poll(zoneTop).toBeGreaterThan(top0 + 20);
});

test('a live race is never paused by leaving the app (friends are still driving)', async ({ page }) => {
  await race(page);
  await page.evaluate(() => { window.__OT.GameState.mode = 'LIVE'; });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await status(page)).toBe('PLAYING');
  await expect(page.locator('#settingsModal')).toBeHidden();
});
