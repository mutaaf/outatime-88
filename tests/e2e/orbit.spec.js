// The low-orbit skyway (ticket 0150): ?level=orbit opens it, its 2D world and 3D planet render,
// and jumps hang in low gravity.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const unlockAll = (page) => page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ unlockedLevel: 6, onboarded: true })), SAVE);

test('?level=orbit picks the orbit skyway and its 2D world renders: Earth below, stars above', async ({ page }, info) => {
  const problems = watchPage(page);
  await unlockAll(page);
  await page.goto(`${APP}?level=orbit&debug`);
  await expect(page.locator('#playHint')).toContainText('LOW ORBIT');
  expect(await page.evaluate(() => window.__OT.GameState.levelIndex)).toBe(5);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  await page.waitForFunction(() => window.__OT.backdrop()?.id === '2061', null, { timeout: 8000 });
  await page.waitForTimeout(400);
  // The sky is mostly dark space; the bottom of the screen (beside the road) is the planet.
  const tone = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas'), ctx = c.getContext('2d');
    const avg = (y) => { const { data } = ctx.getImageData(0, Math.floor(y), Math.floor(c.width * 0.12), 1); let r = 0, b = 0; for (let p = 0; p < data.length; p += 4) { r += data[p]; b += data[p + 2]; } const n = data.length / 4; return { r: r / n, b: b / n }; };
    return { top: avg(c.height * 0.08), low: avg(c.height * 0.62) };
  });
  expect(tone.top.r + tone.top.b, 'space is dark').toBeLessThan(120);
  expect(tone.low.b, 'the planet is blue').toBeGreaterThan(tone.low.r);
  await info.attach('orbit-2d', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});

test('jumps hang about twice as long in low orbit as on the ground', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  const airtime = (era) => page.evaluate(async (e) => {
    const g = window.__OT.GameState;
    g.eraIndex = e;
    await new Promise((r) => setTimeout(r, 100));
    g.playerY = 1; g.playerVY = 490;
    const t0 = g.raceTime;
    await new Promise((resolve) => { const tick = () => (g.playerY <= 0 ? resolve() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
    return g.raceTime - t0;
  }, era);
  const ground = await airtime(0);
  const orbit = await airtime(6);
  expect(orbit / ground).toBeGreaterThan(1.7);
  expect(problems).toEqual([]);
});

test('3D: the orbit era shows the planet below the glass highway', async ({ page }, info) => {
  test.setTimeout(120_000);
  const problems = watchPage(page);
  await unlockAll(page);
  await page.goto(`${APP}?debug&view=3d&gfx=low&level=6`);
  await page.waitForFunction(() => { const v = window.__OT.view(); return v.stats && v.stats.frames > 3; }, null, { timeout: 60_000 });
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__OT.GameState.eraIndex)).toBe(6);
  const f = await page.evaluate(() => window.__OT.view().stats.frames);
  await page.waitForFunction((k) => window.__OT.view().stats.frames > k + 8, f, { timeout: 30_000 });
  await info.attach('orbit-3d', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
});
