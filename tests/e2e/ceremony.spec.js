// Race ceremony (ticket 0052): every racer called out on the grid, 3-2-1-GO with a rocket
// start, and a chequered flag into a finish order with Retry / Next / Ranks.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const gs = (page, key) => page.evaluate((k) => window.__OT.GameState[k], key);
// The ceremony is a lazy chunk fetched at boot; a test can be faster than a player's first tap.
const ready = (page) => page.evaluate(() => window.__OT.ready());

test('the lineup calls out all six racers, you last, and a tap skips to the lights', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace());
  expect(await gs(page, 'racePhase')).toBe('START');
  const names = new Set();
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#rcCard')).toBeVisible();
    names.add(await page.locator('#rcCard .rc-name').innerText());
    await page.waitForTimeout(950);
  }
  expect(names.size).toBeGreaterThanOrEqual(4); // a new racer roughly every second
  await expect(page.locator('#rcCard .rc-name')).toHaveText('YOU!', { timeout: 3000 });
  expect(await gs(page, 'speed')).toBe(0); // nobody moves before green
  expect(await gs(page, 'raceTime')).toBe(0);

  // Coming back to the same track (0145): the lineup is remembered, so it's straight to the lights.
  await page.reload();
  await ready(page);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('#rcCard')).toBeHidden();

  // A track you haven't seen yet plays the lineup, and a tap skips it.
  await page.evaluate(() => { const k = 'outatime_cruisn_88_save_v2'; const d = JSON.parse(localStorage.getItem(k)); d.lineupsSeen = []; localStorage.setItem(k, JSON.stringify(d)); });
  await page.reload();
  await ready(page);
  await page.evaluate(() => window.__OT.startRace());
  await expect(page.locator('#rcSkip')).toBeVisible();
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('#rcCard')).toBeHidden();
  await expect(page.locator('#rcCount')).toHaveText('GO!', { timeout: 4000 });
  await expect.poll(() => gs(page, 'racePhase')).toBe('RACING');
  await expect.poll(() => gs(page, 'speed')).toBeGreaterThan(20);
  await expect(page.locator('#raceStage')).toBeHidden({ timeout: 2000 });
  expect(problems).toEqual([]);
});

test('tapping boost right on green is a rocket start; too early stalls you', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace());
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '1');
  await page.waitForTimeout(700); // ~0.2 s before green
  await page.keyboard.press('Space');
  await expect.poll(() => gs(page, 'launchResult')).toMatch(/perfect|good/);
  expect(await gs(page, 'speed')).toBeGreaterThan(55);

  // Retry: no lineup this time, and a press on the first red light jumps the start.
  await page.evaluate(() => window.__OT.finishRun());
  await page.locator('#btnPlayAgain').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '3', { timeout: 1500 });
  await expect(page.locator('#rcCard')).toBeHidden();
  await page.keyboard.press('Space');
  await expect.poll(() => gs(page, 'launchResult'), { timeout: 5000 }).toBe('early');
  expect(await gs(page, 'launchStall')).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

for (const vp of [{ width: 820, height: 1180 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) {
  test(`chequered flag, then every racer in finish order with Retry and Ranks at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await ready(page);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForTimeout(400);
    await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 15; });
    await expect(page.locator('#rcFinish')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#rcFinishPlace')).toHaveText(/^\d(ST|ND|RD|TH)$/);
    await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#endPodium li')).toHaveCount(6);
    await expect(page.locator('#endPodium .pod-you')).toHaveCount(1);
    await expect(page.locator('#endModalTitle')).toHaveText(/PLACE|WIN/);
    for (const sel of ['#endPodium', '#btnPlayAgain', '#btnOpenLeaderboardFromEnd']) await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
    expect(problems).toEqual([]);
  });
}

test('NEXT takes you to the next open level', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ unlockedLevel: 3, onboarded: true, bestScore: 1 })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__OT.finishRun());
  await expect(page.locator('#btnNextRace')).toBeVisible();
  await page.locator('#btnNextRace').click();
  expect(await gs(page, 'levelIndex')).toBe(1);
  expect(await gs(page, 'status')).toBe('PLAYING');
});
