// Pause → resume never leaves the race frozen, whichever way you paused, and a thumb that
// goes down during the start lights is the stick once the race goes green.
import { test, expect } from '@playwright/test';
import { APP, watchPage, touchReady, nextFrames, racing, simWait } from './helpers.js';

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
  // The 3-2-1 resume beat (0231) holds the race for ~0.9 s, then it must drive on.
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat > 0, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__OT.GameState.resumeBeat === 0, null, { timeout: 10_000 });
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
  expect(await zoneTop()).toBe(top0); // the controls hold still under the thumb
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

// Ticket 0231: resuming a solo race counts 3 → 2 → 1 on the announcer while the race holds still.
test.describe('resume beat (keyboard, 1280x720)', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });

  /** Records, every frame from now on, the beat number, the announcer's text and the race distance. */
  const record = (page) => page.evaluate(() => {
    const log = window.__beatLog = [];
    const el = document.getElementById('announcerMain');
    (function tick() {
      const g = window.__OT.GameState;
      log.push({ t: performance.now(), n: g.resumeBeat, d: g.distance, s: g.status, text: el.textContent, big: el.classList.contains('is-beat') });
      if (log.length < 2000) requestAnimationFrame(tick);
    })();
  });
  const beatLog = (page) => page.evaluate(() => window.__beatLog.slice());

  async function soloRace(page) {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
        sessionStorage.setItem('seeded', '1');
      }
    }, SAVE_KEY);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await racing(page);
  }

  test('Escape, Escape: the race holds for 3, 2, 1, then drives on', async ({ page }) => {
    const problems = watchPage(page);
    await soloRace(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible(); // the pause sheet is up: Escape closes it
    await record(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__beatLog.some((r) => r.n > 0), null, { timeout: 10_000 });
    await page.waitForFunction(() => { const l = window.__beatLog; return l.some((r) => r.n > 0) && l[l.length - 1].n === 0; }, null, { timeout: 10_000 });
    const log = await beatLog(page);
    const beat = log.filter((r) => r.n > 0);
    expect(beat.every((r) => r.s === 'PLAYING')).toBe(true);
    // 3, 2, 1 in order, each in the one announcement slot (nothing else on it), shown big.
    expect([...new Set(beat.map((r) => r.n))]).toEqual([3, 2, 1]);
    for (const r of beat) { expect(r.text).toBe(String(r.n)); expect(r.big).toBe(true); }
    // The race does not move during the beat, which lasts ~0.9 s of wall time.
    const d0 = log.find((r) => r.s === 'PAUSED').d;
    for (const r of beat) expect(r.d).toBe(d0);
    expect(beat[beat.length - 1].t - beat[0].t).toBeGreaterThan(600);
    expect(await page.locator('#announcerMain').evaluate((el) => el.classList.contains('is-beat'))).toBe(false);
    // Then it drives on.
    expect(await simWait(page, 0.5)).toBe(true);
    expect(await page.evaluate(() => window.__OT.GameState.distance)).toBeGreaterThan(d0);
    expect(problems).toEqual([]);
  });

  test('pausing again during the beat restarts it from 3; a new race never inherits it', async ({ page }) => {
    await soloRace(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible(); // the pause sheet is up: Escape closes it
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__OT.GameState.resumeBeat > 0, null, { timeout: 10_000 });
    await page.keyboard.press('Escape'); // paused again mid-beat
    await expect.poll(() => status(page)).toBe('PAUSED');
    await expect(page.locator('#garageModal')).toBeVisible(); // the pause sheet is up: Escape closes it
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.resumeBeat)).toBe(0);
    await record(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__beatLog.some((r) => r.n > 0), null, { timeout: 10_000 });
    expect((await beatLog(page)).find((r) => r.n > 0).n).toBe(3);
    // A new race started mid-beat (the title's PLAY, a retry) runs: no beat held over.
    await page.evaluate(() => window.__OT.startRace());
    expect(await page.evaluate(() => window.__OT.GameState.resumeBeat)).toBe(0);
    await racing(page);
    expect(await simWait(page, 0.5)).toBe(true);
  });

  test('a race back from PAUSED in a live room gets no beat', async ({ page }) => {
    await soloRace(page);
    await page.evaluate(() => { const g = window.__OT.GameState; g.mode = 'LIVE'; g.status = 'PAUSED'; });
    await record(page);
    await nextFrames(page, 3);
    await page.evaluate(() => { window.__OT.GameState.status = 'PLAYING'; });
    await nextFrames(page, 6);
    expect((await beatLog(page)).every((r) => r.n === 0)).toBe(true);
  });
});
