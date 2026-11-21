// Ticket 0292: RESTART RACE on the pause sheet re-runs the same event (same level, same car, the
// daily's same seed) from a clean start, records nothing from the abandoned attempt, and is not
// offered in Endless runs.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait, nextFrames } from './helpers.js';

const BTN = '#btnRestartRace';
const ROW = ['#btnChangeEventFromGarage', '#btnSettingsFromGarage', '#garageModal .quit-home', BTN, '#btnResumeFromGarage'];

/** Everything a finished race would write: career counters, level medals/bests, lap bests, Endless bests, best score. */
const records = (page) => page.evaluate(() => {
  const d = window.__OT.save();
  return JSON.stringify({ career: d.career, progress: d.progress, bestLaps: d.bestLaps, endless: d.endless, bestScore: d.bestScore });
});

async function startAndPause(page, opts) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.save);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate((o) => window.__OT.startRace(o), opts);
  await racing(page);
  await simWait(page, 2);
  // Dirty the run so the reset is visible: score, damage, distance.
  await page.evaluate(() => { const g = window.__OT.GameState; g.score = 54321; g.hp = Math.max(1, g.hp - 20); g.distance += 400; });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
  await expect(page.locator('#btnResumeFromGarage')).toBeVisible({ timeout: 15_000 });
}

const state = (page) => page.evaluate(() => {
  const g = window.__OT.GameState;
  return { status: g.status, levelIndex: g.levelIndex, car: g.selectedCharIdx, mode: g.mode, raceTime: g.raceTime, score: g.score,
    hp: g.hp, maxHp: g.maxHp, distance: g.distance, laps: (g.lapSplits || []).length, lineSeed: g.lineSeed, daily: g.daily && g.daily.seed };
});

test.describe('desktop 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('RESTART RACE re-runs the same campaign event from a clean start and records nothing', async ({ page }) => {
    const problems = watchPage(page);
    await startAndPause(page, { mode: 'ARCADE' });
    const before = await state(page);
    const saved = await records(page);
    expect(before.raceTime).toBeGreaterThan(1.5);
    await expect(page.locator(BTN)).toBeVisible();
    // Every pause action is whole on screen and a real target.
    for (const sel of ROW) {
      const b = await page.locator(sel).boundingBox();
      expect(b, sel).not.toBeNull();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1280.5);
      expect(b.y + b.height).toBeLessThanOrEqual(720.5);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator(BTN).click();
    await expect(page.locator('#garageModal')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    const after = await state(page);
    expect(after.levelIndex).toBe(before.levelIndex);
    expect(after.car).toBe(before.car);
    expect(after.mode).toBe('ARCADE');
    expect(after.raceTime).toBeLessThan(1);
    expect(after.score).toBeLessThan(1000);
    expect(after.hp).toBe(after.maxHp);
    expect(after.distance).toBeLessThan(before.distance);
    expect(after.laps).toBe(0);
    // Nothing from the abandoned attempt is saved, and focus is not left on a menu button.
    expect(await records(page)).toBe(saved);
    expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !document.activeElement.closest('#garageModal'))).toBe(true);
    // The restarted race really runs.
    await racing(page);
    expect(problems).toEqual([]);
  });

  test('the daily restarts on the same seed', async ({ page }) => {
    const problems = watchPage(page);
    await startAndPause(page, { daily: true });
    const before = await state(page);
    expect(before.daily).toBeTruthy();
    await expect(page.locator(BTN)).toBeVisible();
    await page.locator(BTN).click();
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    const after = await state(page);
    expect(after.daily).toBe(before.daily);
    expect(after.lineSeed).toBe(before.lineSeed);
    expect(after.levelIndex).toBe(before.levelIndex);
    expect(after.raceTime).toBeLessThan(1);
    expect(problems).toEqual([]);
  });

  test('Endless runs offer no restart, and the title Garage never shows it', async ({ page }) => {
    const problems = watchPage(page);
    await startAndPause(page, { mode: 'INFINITE' });
    await expect(page.locator(BTN)).toBeHidden();
    await page.locator('#btnResumeFromGarage').click();
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    // From the title, the Garage is a shop, not a pause sheet.
    await page.goto(`${APP}?debug`);
    await page.locator('#btnOpenGarageFromTitle').click();
    await expect(page.locator('#btnResumeFromGarage')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(BTN)).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('a race past the finish line offers no restart (the finish is being written)', async ({ page }) => {
    const problems = watchPage(page);
    await startAndPause(page, { mode: 'ARCADE' });
    await expect(page.locator(BTN)).toBeVisible();
    await page.locator('#btnResumeFromGarage').click();
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
    // Cross the line: the roll-out is PLAYING with racePhase FINISHED, and Escape still pauses it.
    await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 20; });
    await page.waitForFunction(() => window.__OT.GameState.racePhase === 'FINISHED', null, { timeout: 20_000 });
    await page.evaluate(() => window.__OT.pause());
    await page.evaluate(() => document.getElementById('garageModal').classList.remove('hidden'));
    await expect(page.locator(BTN)).toBeHidden();
    expect(problems).toEqual([]);
  });
});

test.describe('1280x720 pad', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the D-pad reaches RESTART RACE on the pause sheet and A restarts', async ({ page }) => {
    const problems = watchPage(page);
    await page.addInitScript(() => {
      const btn = () => ({ pressed: false, value: 0 });
      const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn) };
      navigator.getGamepads = () => [pad];
      window.__btn = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
      // A tap held for exactly two game frames, so a starved runner never holds it into the menu repeat.
      window.__taps = 0;
      const left = {};
      window.__tap = (i) => { window.__btn(i, true); left[i] = 3; window.__taps++; };
      const loop = () => {
        for (const k in left) if (--left[k] <= 0) { window.__btn(Number(k), false); delete left[k]; window.__taps--; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      window.__moves = 0;
      document.addEventListener('focusin', () => { window.__moves++; }, true);
    });
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await racing(page);
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /restart-race-[^/]*\.js/.test(e.name) && e.responseEnd > 0), null, { timeout: 20_000 });
    await simWait(page, 1.5);
    const tap = async (i) => {
      const n = await page.evaluate(() => window.__moves);
      await page.evaluate((b) => window.__tap(b), i);
      await page.waitForFunction((k) => window.__taps === 0 && window.__moves >= k, n, { timeout: 10_000 });
      await nextFrames(page, 3);
    };
    await tap(9); // START pauses
    await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PAUSED');
    await expect(page.locator(BTN)).toBeVisible({ timeout: 15_000 });
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      const n = await page.evaluate(() => window.__moves);
      await page.evaluate(() => window.__tap(13)); // D-pad down = next control
      await page.waitForFunction((k) => window.__moves > k && window.__taps === 0, n, { timeout: 10_000 });
      await nextFrames(page, 2);
      found = await page.evaluate(() => document.activeElement && document.activeElement.id === 'btnRestartRace');
    }
    expect(found, 'D-pad reaches RESTART RACE').toBe(true);
    const before = await page.evaluate(() => window.__OT.GameState.raceTime);
    expect(before).toBeGreaterThan(1);
    await page.evaluate(() => window.__tap(0)); // A presses it
    await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.raceTime < 1, null, { timeout: 10_000 });
    await expect(page.locator('#garageModal')).toBeHidden();
    expect(problems).toEqual([]);
  });
});

for (const s of [
  { name: 'phone portrait 390x844', viewport: { width: 390, height: 844 } },
  { name: 'phone portrait 320x568', viewport: { width: 320, height: 568 } },
  { name: 'phone landscape 844x390', viewport: { width: 844, height: 390 } },
]) {
  test.describe(s.name, () => {
    test.use({ viewport: s.viewport, hasTouch: true, isMobile: true });

    test('the five pause actions fit in the pinned bar and RESTART RACE taps', async ({ page }) => {
      const problems = watchPage(page);
      await startAndPause(page, { mode: 'ARCADE' });
      await expect(page.locator(BTN)).toBeVisible();
      const row = await page.locator('#garageActions').boundingBox();
      expect(Math.abs(row.y + row.height - s.viewport.height)).toBeLessThan(1.5);
      if (s.viewport.height < 500) expect(row.height).toBeLessThanOrEqual(s.viewport.height * 0.25);
      for (const sel of ROW) {
        const b = await page.locator(sel).boundingBox();
        expect(b.x, sel).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, sel).toBeLessThanOrEqual(s.viewport.width + 0.5);
        expect(b.y + b.height, sel).toBeLessThanOrEqual(s.viewport.height + 0.5);
        expect(b.height, sel).toBeGreaterThanOrEqual(44);
        // The label is never clipped: its text fits the button.
        expect(await page.locator(sel).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${sel} label fits`).toBe(true);
      }
      await page.locator(BTN).tap();
      await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
      expect(await page.evaluate(() => window.__OT.GameState.raceTime)).toBeLessThan(1);
      expect(problems).toEqual([]);
    });
  });
}
