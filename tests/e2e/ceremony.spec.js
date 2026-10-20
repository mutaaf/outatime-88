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
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
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
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('#rcCard')).toBeHidden();

  // A track you haven't seen yet plays the lineup, and a tap skips it.
  await page.evaluate(() => { const k = 'outatime_cruisn_88_save_v2'; const d = JSON.parse(localStorage.getItem(k)); d.lineupsSeen = []; localStorage.setItem(k, JSON.stringify(d)); });
  await page.reload();
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
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
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '1');
  // Tap the moment the lights go green. The lights run on game time, so a wall-clock wait
  // ("0.7 s after the last red") lands too early on a runner that steps the sim slowly: press
  // from the page itself, as the light changes, before the next sim step.
  await page.evaluate(() => new Promise((done) => {
    const el = document.getElementById('rcLights');
    const press = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
      done();
    };
    if (el.dataset.state === 'go') { press(); return; }
    new MutationObserver((_, obs) => { if (el.dataset.state === 'go') { obs.disconnect(); press(); } }).observe(el, { attributes: true });
  }));
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
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
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
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__OT.finishRun());
  await expect(page.locator('#btnNextRace')).toBeVisible();
  await page.locator('#btnNextRace').click();
  expect(await gs(page, 'levelIndex')).toBe(1);
  expect(await gs(page, 'status')).toBe('PLAYING');
});

// Ticket 0111: the grid speaks the input in hand, says it once, and keeps the road in view.
const rocketPrompts = (page) => page.evaluate(() => (document.body.innerText.match(/ROCKET START/g) || []).length);
const gridShare = async (page) => {
  await expect(page.locator('#rcGrid')).toBeVisible();
  const box = await page.locator('#rcGrid').boundingBox();
  return box.height / page.viewportSize().height;
};

test('keyboard: the grid names Space and Enter, never TAP, once, in a slim line-up', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => { const k = 'outatime_cruisn_88_save_v2'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.lineupsSeen = []; localStorage.setItem(k, JSON.stringify(d)); });
  await page.keyboard.press('KeyM');
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#rcSkip')).toHaveText('PRESS ENTER TO SKIP ▶▶');
  await page.keyboard.press('Enter');
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('#rcHint')).toHaveText('PRESS SPACE RIGHT ON GREEN FOR A ROCKET START');
  expect(await rocketPrompts(page)).toBe(1);
  expect(await page.locator('#raceStage').innerText()).not.toMatch(/TAP/);
  expect(await gridShare(page)).toBeLessThanOrEqual(0.12);
  // The grid sits above the lights: nothing of the line-up is over the car at the bottom.
  const grid = await page.locator('#rcGrid').boundingBox();
  const lights = await page.locator('#rcLights').boundingBox();
  expect(grid.y + grid.height).toBeLessThanOrEqual(lights.y);
  expect(problems).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('touch keeps the ⚡ wording, once, and the line-up stays slim', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug&intro`);
    await ready(page);
    // A finger on the screen (not the title's one-tap start) makes touch the input in hand.
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' })));
    expect(await page.evaluate(() => window.__OT.InputState.lastInput)).toBe('touch');
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
    await expect(page.locator('#rcSkip')).toHaveText('TAP TO SKIP ▶▶');
    await page.locator('#rcSkip').tap();
    await expect(page.locator('#rcHint')).toHaveText('TAP ⚡ RIGHT ON GREEN FOR A ROCKET START', { timeout: 1500 });
    expect(await rocketPrompts(page)).toBe(1);
    expect(await gridShare(page)).toBeLessThanOrEqual(0.12);
    expect(problems).toEqual([]);
  });
});

const fakePad = (page) => page.addInitScript(() => {
  const btn = (i) => ({ get pressed() { return window.__padDown === i; }, get value() { return window.__padDown === i ? 1 : 0; } });
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i)) };
  navigator.getGamepads = () => [pad];
});

test('gamepad: the grid names the pad button, and X skips the line-up', async ({ page }) => {
  const problems = watchPage(page);
  await fakePad(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected'))); // a pad's first press
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#rcSkip')).toHaveText('PRESS X TO SKIP ▶▶');
  await page.evaluate(() => { window.__padDown = 2; }); // X goes down
  await expect(page.locator('#rcLights')).toBeVisible({ timeout: 3000 });
  await page.evaluate(() => { window.__padDown = -1; });
  await expect(page.locator('#rcHint')).toHaveText('PRESS X OR RB RIGHT ON GREEN FOR A ROCKET START');
  expect(await rocketPrompts(page)).toBe(1);
  expect(problems).toEqual([]);
});

test('gamepad: X right on green is a rocket start, like Space', async ({ page }) => {
  const problems = watchPage(page);
  await fakePad(page);
  await page.goto(`${APP}?debug&intro`);
  await ready(page);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.locator('#rcSkip').click();
  await expect(page.locator('#rcLights')).toHaveAttribute('data-state', '1');
  // Press as the light turns green (game time, not the wall clock: see the Space test above).
  await page.evaluate(() => new Promise((done) => {
    const el = document.getElementById('rcLights');
    const press = () => { window.__padDown = 2; done(); };
    if (el.dataset.state === 'go') { press(); return; }
    new MutationObserver((_, obs) => { if (el.dataset.state === 'go') { obs.disconnect(); press(); } }).observe(el, { attributes: true });
  }));
  await expect.poll(() => gs(page, 'launchResult')).toMatch(/perfect|good/);
  await page.evaluate(() => { window.__padDown = -1; });
  expect(problems).toEqual([]);
});
