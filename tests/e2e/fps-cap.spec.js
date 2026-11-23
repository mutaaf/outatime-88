// FRAME RATE 30 (ticket 0302): Settings → Graphics → Frame rate AUTO | 30 FPS, saved as settings.fps
// ('30'; AUTO deletes the key). With 30, main's loop skips whole display frames, so the game canvas
// is drawn ~30 times a second while the 120 Hz sim keeps real time; the governor judges frames
// against the cap, not the refresh.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const seed = (page, settings) => page.addInitScript(([k, s]) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true, settings: s }));
}, [KEY, settings]);
const gfxReady = (page) => page.waitForFunction(() => window.__OT && window.__OT.gfx && window.__OT.gfx(), null, { timeout: 15_000 });

/**
 * Over `ms` of wall clock mid-race: display frames (rAF ticks), frames that drew the game canvas,
 * and race seconds the sim advanced.
 */
const measure = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const ctx = document.getElementById('gameCanvas').getContext('2d');
  const blit = ctx.drawImage;
  let drew = false, ticks = 0, drawn = 0;
  ctx.drawImage = function (...a) { drew = true; return blit.apply(this, a); };
  const G = window.__OT.GameState;
  const t0 = performance.now(), race0 = G.raceTime;
  const tick = (now) => {
    ticks++;
    if (drew) drawn++;
    drew = false;
    if (now - t0 < ms) { requestAnimationFrame(tick); return; }
    ctx.drawImage = blit;
    const wall = (performance.now() - t0) / 1000;
    done({ tickRate: ticks / wall, drawRate: drawn / wall, simRate: (G.raceTime - race0) / wall });
  };
  requestAnimationFrame(tick);
}), ms);

async function raceFor(page) {
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page, { minTime: 1 });
  await page.evaluate(() => { window.__OT.InputState.up = true; });
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`FRAME RATE row at ${vp.width}x${vp.height}: 30 FPS saves, applies, survives a reload; AUTO clears it`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await seed(page, {});
    await page.goto(`${APP}?debug`);
    await gfxReady(page);
    await page.locator('#btnOpenSettings').click();
    const auto = page.locator('[data-setting="fps"] [data-value="auto"]');
    const cap = page.locator('[data-setting="fps"] [data-value="30"]');
    await expect(page.locator('[data-setting="fps"]')).toHaveAttribute('aria-label', 'Frame rate');
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await cap.scrollIntoViewIfNeeded();
    const box = await cap.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(vp.width < 500 ? 32 : 24);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    // Keyboard path: focus the button and press Enter.
    await cap.focus();
    await page.keyboard.press('Enter');
    await expect(cap).toHaveAttribute('aria-pressed', 'true');
    await expect(auto).toHaveAttribute('aria-pressed', 'false');
    expect((await saved(page)).settings.fps).toBe('30');
    expect(await page.evaluate(() => window.__OT.gfx().capMs)).toBeCloseTo(33.33, 1);

    await page.reload();
    await gfxReady(page);
    expect(await page.evaluate(() => window.__OT.gfx().capMs)).toBeCloseTo(33.33, 1);
    await page.locator('#btnOpenSettings').click();
    await expect(cap).toHaveAttribute('aria-pressed', 'true');
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    expect('fps' in (await saved(page)).settings).toBe(false);
    expect(await page.evaluate(() => window.__OT.gfx().capMs)).toBe(0);
    expect(problems).toEqual([]);
  });
}

test('junk in settings.fps reads as AUTO', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { fps: 'turbo' });
  await page.goto(`${APP}?debug`);
  await gfxReady(page);
  expect(await page.evaluate(() => window.__OT.gfx().capMs)).toBe(0);
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="fps"] [data-value="auto"]')).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test('30 FPS: the canvas draws ~30 times a second, the sim keeps real time, quality holds @perf', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { fps: '30', graphics: 'medium' });
  await page.goto(`${APP}?debug&view=2d`);
  await gfxReady(page);
  await raceFor(page);
  const capped = await measure(page, 3000);
  test.info().annotations.push({ type: 'capped', description: JSON.stringify(capped) });
  expect(capped.drawRate).toBeLessThanOrEqual(33);
  expect(capped.drawRate).toBeGreaterThanOrEqual(Math.min(27, capped.tickRate * 0.9));
  if (capped.tickRate > 50) expect(capped.drawRate / capped.tickRate).toBeLessThan(0.62); // 60 Hz: every other frame
  expect(capped.simRate).toBeGreaterThan(0.9); // the race clock still runs in real time
  expect(capped.simRate).toBeLessThan(1.1);
  expect(await page.evaluate(() => window.__OT.gfx().step)).toBe(0); // a deliberate 30 is not "slow"
  expect(await page.evaluate(() => window.__OT.gfx().budgetMs)).toBeGreaterThan(40);
  expect(problems).toEqual([]);
});

test('AUTO draws every display frame (today) @perf', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { graphics: 'medium' });
  await page.goto(`${APP}?debug&view=2d`);
  await gfxReady(page);
  await raceFor(page);
  const free = await measure(page, 3000);
  test.info().annotations.push({ type: 'auto', description: JSON.stringify(free) });
  expect(free.drawRate / free.tickRate).toBeGreaterThan(0.9);
  expect(free.simRate).toBeGreaterThan(0.9);
  expect(problems).toEqual([]);
});
