// Tyre smoke and squeal, and the recorded CC0 sound effects (ticket 0132).
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const AUDIO = /\/assets\/[\w-]+\.(mp3|wav)$/;

/** Start a race and hold a brake-and-steer power drift at 80 mph (the sim's own drift). */
async function drift(page) {
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START', null, { timeout: 15_000 });
  await page.evaluate(() => {
    const g = window.__OT.GameState;
    window.__hold = setInterval(() => { g.speed = 80; g.playerY = 0; g.playerX = 0; g.playerVX = 0; }, 10);
  });
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowLeft');
}

test('2D: a power drift pours tyre smoke from the rear tyres, and it clears afterwards', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.smoke());
  await drift(page);
  await page.waitForFunction(() => window.__OT.GameState.smokePuffs > 20, null, { timeout: 10_000 });
  const live = await page.evaluate(() => ({ alive: window.__OT.smoke().alive(), cap: window.__OT.smoke().capacity, level: window.__OT.GameState.smokeLevel }));
  expect(live.alive).toBeGreaterThan(0);
  expect(live.alive).toBeLessThanOrEqual(live.cap); // a fixed pool, never more
  expect(live.level).toBeGreaterThan(0.3);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.evaluate(() => clearInterval(window.__hold));
  await page.waitForFunction(() => window.__OT.GameState.smokeLevel < 0.05 && window.__OT.smoke().alive() === 0, null, { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('recorded sounds load lazily after the first interaction, from the game itself, all 200', async ({ page }) => {
  const problems = watchPage(page);
  const audio = [];
  page.on('response', (r) => { if (AUDIO.test(new URL(r.url()).pathname)) audio.push({ url: r.url(), status: r.status() }); });
  await page.goto(`${APP}?debug`);
  await page.waitForTimeout(1200);
  expect(audio).toEqual([]); // nothing until there's an AudioContext (a tap or key)
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => { const b = window.__OT.audio().bank; return b && b.loaded + b.failed >= 20; }, null, { timeout: 20_000 });
  const bank = await page.evaluate(() => { const b = window.__OT.audio().bank; return { loaded: b.loaded, failed: b.failed, engine: b.engineReady() }; });
  expect(bank.failed).toBe(0);
  expect(bank.engine).toBe(true);
  expect(audio.length).toBeGreaterThan(10);
  for (const a of audio) {
    expect(new URL(a.url).origin).toBe(new URL(page.url()).origin);
    expect(a.status).toBe(200);
  }
  expect(problems).toEqual([]);
});

test('the squeal follows the drift and the sampled engine takes over from the synth', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => { const b = window.__OT.audio().bank; return b && b.engineReady(); }, null, { timeout: 20_000 });
  await page.keyboard.press('Escape').catch(() => {});
  await drift(page);
  await page.waitForFunction(() => window.__OT.audio().synthEngineOff === true, null, { timeout: 10_000 });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__OT.audio().bank.tyres(window.__OT.GameState, 0))).toBeGreaterThan(0);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.evaluate(() => clearInterval(window.__hold));
  expect(problems).toEqual([]);
});

test('3D: tyre smoke is world-space puffs in one draw', async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=3d`);
  await page.waitForFunction(() => { const v = window.__OT && window.__OT.view(); return v && v.stats && v.stats.frames > 2; }, null, { timeout: 30_000 });
  await drift(page);
  await page.waitForFunction(() => window.__OT.view().stats.smoke > 3, null, { timeout: 30_000 });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.evaluate(() => clearInterval(window.__hold));
  expect(problems).toEqual([]);
});
