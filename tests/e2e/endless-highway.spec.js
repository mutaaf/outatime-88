// Endless Highway (ticket 0150): the default mode, tiers that level up, HP both ways, game over.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const G = (page, fn) => page.evaluate(fn);

test('PLAY on the title starts the Endless Highway, and the title sells it', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await expect(page.locator('#playHint')).toContainText('ENDLESS');
  await expect(page.locator('#titleEventChip')).toContainText('ENDLESS HIGHWAY');
  await page.locator('#btnStartRace').click();
  expect(await G(page, () => window.__OT.GameState.mode)).toBe('INFINITE');
  expect(await G(page, () => window.__OT.GameState.raceLength)).toBe(0);
  await expect(page.locator('#hudLap')).toContainText('T1 ·');
  expect(problems).toEqual([]);
});

test('driving a tier levels up: banner, tier, difficulty, healed HP', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = Math.round(g.maxHp * 0.5); g.distance = 2601; });
  await page.waitForFunction(() => window.__OT.GameState.tier === 2);
  const s = await G(page, () => { const g = window.__OT.GameState; return { d: g.difficulty, hp: g.hp, max: g.maxHp, coin: g.coinMult }; });
  expect(s.d).toBeGreaterThan(0.1);
  expect(s.hp).toBeGreaterThan(s.max * 0.5);
  expect(s.coin).toBeCloseTo(1.2);
  await expect(page.locator('#announcerMain')).toContainText('LEVEL UP');
  await expect(page.locator('#hudLap')).toContainText('T2');
  expect(problems).toEqual([]);
});

test('HP goes down on a hit and up on a repair, with the HUD showing both', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  const max = await G(page, () => window.__OT.GameState.maxHp);
  await G(page, () => { window.__OT.GameState.invulnTimer = 0; window.__OT.damage(20); });
  const afterHit = await G(page, () => window.__OT.GameState.hp);
  expect(afterHit).toBeLessThan(max);
  await expect(page.locator('#hudHpPop')).toHaveText(/−\d+ HP/);
  await expect(page.locator('#hudHpBox')).toHaveAttribute('data-fx', /^hit/);
  await G(page, () => window.__OT.heal(12));
  expect(await G(page, () => window.__OT.GameState.hp)).toBeCloseTo(Math.min(max, afterHit + 12), 0);
  await expect(page.locator('#hudHpPop')).toHaveText(/\+\d+ HP/);
  await expect(page.locator('#hudHpBox')).toHaveAttribute('data-fx', /^heal/);
  // Never past max, never below zero.
  await G(page, () => window.__OT.heal(9999));
  expect(await G(page, () => window.__OT.GameState.hp)).toBe(max);
  expect(problems).toEqual([]);
});

test('HP at zero ends the endless run with distance, tier and best', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  await G(page, () => { const g = window.__OT.GameState; g.distance = 3200; });
  await page.waitForFunction(() => window.__OT.GameState.tier === 2);
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = 5; window.__OT.damage(50); });
  // With enough cash the one continue is offered first (ticket 0151): decline it.
  await page.locator('#btnContinueNo').click();
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#endModalBadge')).toContainText('RUN OVER AT TIER 2');
  await expect(page.locator('#endModalTitle')).toContainText(/NEW BEST RUN|TIER 2/);
  await expect(page.locator('#endHeadline')).toContainText('m · TIER 2');
  const best = await G(page, () => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).endless);
  expect(best.bestTier).toBe(2);
  expect(best.bestDistance).toBeGreaterThanOrEqual(3200);
  // The title now shows the best to beat.
  expect(problems).toEqual([]);
});

test('a track race wreck patches you up instead of ending the race', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await G(page, () => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING');
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = 3; window.__OT.damage(50); });
  const s = await G(page, () => { const g = window.__OT.GameState; return { status: g.status, hp: g.hp, max: g.maxHp, wrecks: g.wrecks }; });
  expect(s.status).toBe('PLAYING');
  expect(s.wrecks).toBe(1);
  expect(s.hp).toBe(Math.round(s.max * 0.35));
  expect(problems).toEqual([]);
});

test('?play=infinite and ?level= deep links pick the mode', async ({ page }) => {
  await page.goto(`${APP}?debug&play=infinite`);
  await expect(page.locator('#playHint')).toContainText('ENDLESS HIGHWAY');
  await page.locator('#btnStartRace').click();
  expect(await G(page, () => window.__OT.GameState.mode)).toBe('INFINITE');
  await page.goto(`${APP}?debug&level=1`);
  await expect(page.locator('#playHint')).toContainText('TAP TO RACE');
  await page.locator('#btnStartRace').click();
  expect(await G(page, () => window.__OT.GameState.mode)).toBe('ARCADE');
});
