// A real race (ticket 0051): six named racers, three laps, a finish line, and a HUD that
// says where you are at a glance on phones and tablets in both orientations.
import { test, expect } from '@playwright/test';
import { APP, watchPage, HUD_PANELS } from './helpers.js';

const gs = (page, expr) => page.evaluate(`window.__OT.GameState.${expr}`);

test('the HUD shows your place in a field of six, the lap, and the cars either side', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await expect(page.locator('#hudPosOf')).toHaveText('/6');
  await expect(page.locator('#hudLap')).toHaveText('LAP 1/3');
  await expect(page.locator('#hudDots .hud-dot')).toHaveCount(6);
  await expect(page.locator('#hudDots .hud-dot-you')).toHaveCount(1);
  await page.waitForTimeout(1500);
  const pos = await gs(page, 'racePosition');
  await expect(page.locator('#hudPos')).toHaveText(new RegExp(`^${pos}(ST|ND|RD|TH)$`));
  await expect(page.locator('#hudGapAhead')).toHaveText(/▲ (😈)?[A-Z]+ \+\d+\.\ds|★ LEADING/);
  await expect(page.locator('#hudTime')).toHaveText(/^0:0[1-9]\.\d$/);
  expect(problems).toEqual([]);
});

test('the last third of the race is the FINAL LAP', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength * 0.7; });
  await expect(page.locator('#hudLap')).toHaveText('FINAL LAP');
});

test('crossing the line finishes the race with your place and a finish bonus', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__OT.GameState; g.distance = g.raceLength - 20; g.speed = 120; });
  await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#endModalBadge')).toContainText('FINISH');
  const pos = await gs(page, 'racePosition');
  await expect(page.locator('#endWarpsText')).toContainText(new RegExp(`^${pos}(ST|ND|RD|TH)`));
  expect(await gs(page, 'finishTime')).toBeGreaterThan(0.4);
  expect(problems).toEqual([]);
});

test('rotating a tablet mid-race keeps racing and refits the screen', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({ t: window.__OT.GameState.raceTime, d: window.__OT.GameState.distance }));
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(800);
  expect(await gs(page, 'status')).toBe('PLAYING');
  const after = await page.evaluate(() => ({ t: window.__OT.GameState.raceTime, d: window.__OT.GameState.distance, w: document.getElementById('gameCanvas').width }));
  expect(after.t).toBeGreaterThan(before.t + 0.3); // same race, still running (no restart)
  expect(after.d).toBeGreaterThan(before.d);
  expect(after.w).toBe(1180); // the canvas followed the rotation
  for (const sel of HUD_PANELS) await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
  expect(problems).toEqual([]);
});
