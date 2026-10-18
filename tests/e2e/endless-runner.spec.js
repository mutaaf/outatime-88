// Endless runner loop (ticket 0151): the Time Storm, the coins-only continue, run goals, the
// YOUR BEST gate and the instant retry.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const G = (page, fn, arg) => page.evaluate(fn, arg);
async function endless(page, save) {
  if (save) await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, save);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING');
}

test('the Time Storm closes in, glows, catches you; one paid continue, then the run ends', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page, { fluxCoins: 400, onboarded: true });
  await G(page, () => { window.__OT.runner().storm.gap = 120; });
  await expect(page.locator('#hudStorm')).toBeVisible();
  await expect(page.locator('#stormGlow')).not.toHaveCSS('opacity', '0');
  await G(page, () => { window.__OT.GameState.speed = 20; window.__OT.runner().storm.gap = 2; });
  await expect(page.locator('#continueOffer')).toBeVisible();
  await expect(page.locator('#continueReason')).toContainText('TIME STORM');
  expect(await G(page, () => window.__OT.GameState.status)).toBe('CONTINUE');
  await page.locator('#btnContinueYes').click();
  await expect(page.locator('#continueOffer')).toBeHidden();
  const s = await G(page, () => ({ st: window.__OT.GameState.status, used: window.__OT.GameState.continued, gap: window.__OT.runner().storm.gap, coins: JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).fluxCoins }));
  expect(s.st).toBe('PLAYING');
  expect(s.used).toBe(true);
  expect(s.gap).toBeGreaterThanOrEqual(400);
  expect(s.coins).toBeLessThan(400);
  // Caught again: no second continue, straight to the results.
  await G(page, () => { window.__OT.GameState.speed = 20; window.__OT.runner().storm.gap = 1; });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#endModalBadge')).toContainText('TIME STORM');
  await expect(page.locator('#continueOffer')).toBeHidden();
  expect(problems).toEqual([]);
});

test('no cash, no continue: HP 0 ends the run', async ({ page }) => {
  await endless(page, { fluxCoins: 10, onboarded: true });
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = 2; window.__OT.damage(50); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#continueOffer')).toBeHidden();
});

test('meeting a goal marks it done; all three raise the Endless level and the multiplier', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page, { onboarded: true });
  const first = await G(page, () => window.__OT.runner().goals.active.map((g) => ({ ...g })));
  expect(first).toHaveLength(3);
  const statOf = { COINS: 'coins', DRIFT: 'driftSecs', LOOPS: 'loops', CLEAN: 'cleanBest', TIER: 'tier', NEAR: 'nearMisses', NOS: 'nosSecs' };
  await G(page, ([g, k]) => { window.__OT.runner().stats[k] = g.target; }, [first[0], statOf[first[0].type]]);
  await page.waitForFunction(() => window.__OT.runner().goals.active[0].done === true);
  await expect(page.locator('#announcerMain')).toContainText('GOAL DONE');
  await G(page, ([a, b]) => { const st = window.__OT.runner().stats; st[a.k] = a.t; st[b.k] = b.t; },
    [{ k: statOf[first[1].type], t: first[1].target }, { k: statOf[first[2].type], t: first[2].target }]);
  await page.waitForFunction(() => window.__OT.runner().goals.level === 1);
  expect(await G(page, () => window.__OT.GameState.runMult)).toBeCloseTo(1.1);
  await expect(page.locator('#announcerMain')).toContainText('ENDLESS LEVEL 2');
  const saved = await G(page, () => JSON.parse(localStorage.getItem('outatime_cruisn_88_save_v2')).endless.goals.level);
  expect(saved).toBe(1);
  // The pause panel lists the new three.
  await G(page, () => window.__OT.pause());
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#pauseGoals li')).toHaveCount(4);
  expect(problems).toEqual([]);
});

test('your best run is a YOUR BEST gate on the road; RETRY is driving again in under 2 s', async ({ page }) => {
  const problems = watchPage(page);
  await endless(page, { onboarded: true, endless: { bestDistance: 1500, bestTier: 1, runs: 1 } });
  await page.waitForFunction(() => {
    const t = window.__OT.track();
    for (let i = t.start; i < t.end; i++) { const s = t.seg(i); if (s && s.items.some((it) => it.type === 'BEST_GATE')) return true; }
    return false;
  });
  await G(page, () => { const g = window.__OT.GameState; g.invulnTimer = 0; g.hp = 1; window.__OT.damage(50); });
  const offer = page.locator('#continueOffer');
  if (await offer.isVisible()) await page.locator('#btnContinueNo').click();
  await expect(page.locator('#gameOverModal')).toBeVisible();
  const t0 = Date.now();
  await page.locator('#btnPlayAgain').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING');
  expect(Date.now() - t0).toBeLessThan(2000);
  expect(await G(page, () => window.__OT.GameState.mode)).toBe('INFINITE');
  expect(problems).toEqual([]);
});
