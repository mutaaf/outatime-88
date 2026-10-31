// Flash budget (ticket 0234): a warp, a hit and four storm-bolt strikes packed into one second of
// race time ask for five large flashes; the budget lets three through and shows the other two at
// their calm-motion strength (the flash log proves it). A hit has no large flash, so it never asks.
// The flash probe (tests/e2e/helpers.js) is a backstop: nothing on screen rises past 3 a second. Hazards are laid out in race seconds, so a slow runner only spreads
// the strikes out; it can't pack them closer than the race clock does.
import { test, expect } from '@playwright/test';
import { APP, watchPage, installFlashProbe, startFlashProbe, stopFlashProbe, flashRises, simWait, FLASH_MIN } from './helpers.js';

const SEEN = { BRIDGE: 1, WRONGWAY: 1, BEAM: 1, COLLAPSE: 1, TRAIN: 1, EDGE: 1, LIGHTNING: 1 };

async function endless(page) {
  const save = { onboarded: true, fluxCoins: 0, endless: { bestDistance: 0, bestTier: 0, runs: 3, hz: { seen: SEEN, deaths: {} } } };
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, save);
  await installFlashProbe(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.hz && window.__OT.GameState.flashLog);
  // Hands off in the middle lane; the bolts land in the side lanes, so the run goes on.
  await page.evaluate(() => {
    const g = window.__OT.GameState, l = window.__OT.lateral();
    g.speed = 82; g.invulnTimer = 60; g.playerX = 0;
    (function hold() { if (g.status !== 'PLAYING') return; l.x = 0; g.playerX = 0; requestAnimationFrame(hold); })();
  });
}

test('a warp, a hit and four strikes in one second light the screen at most 3 times', async ({ page }) => {
  test.setTimeout(60000);
  const problems = watchPage(page);
  await endless(page);
  expect(await page.evaluate(() => window.__OT.GameState.reducedMotion)).toBe(false);
  const log0 = await page.evaluate(() => ({ ...window.__OT.GameState.flashLog }));
  await startFlashProbe(page);
  // The warp first (forced the way flash-guard.spec does), then, in the same frame it lands, a hit
  // and four strikes ~0.15 s apart (ahead − 0.25 s each), all well inside a second of the warp.
  // The Time Storm's own bolts are held off so only these strike.
  const { t0, lag } = await page.evaluate(() => new Promise((done) => {
    const ot = window.__OT, g = ot.GameState, b = g.timeWarps;
    (function poll() {
      if (g.timeWarps === b) {
        g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
        requestAnimationFrame(poll);
        return;
      }
      g.invulnTimer = 0; ot.damage(4, 'BARREL HIT'); g.invulnTimer = 60; g.hp = Math.max(g.hp, 60);
      g.hz.boltT = 99;
      [0.4, 0.55, 0.7, 0.85].forEach((a, i) => ot.hazard('LIGHTNING', a, i % 2 ? 2 : 0));
      done({ t0: g.raceTime, lag: g.sinceWarp });
    })();
  }));
  expect(lag).toBeLessThan(0.1);
  expect(await simWait(page, 1.6)).toBe(true);
  const r = flashRises(await stopFlashProbe(page));
  const { log, raceTime, warpLit } = await page.evaluate(() => ({ log: window.__OT.GameState.flashLog, raceTime: window.__OT.GameState.raceTime, warpLit: window.__OT.GameState.warpLit }));
  expect(raceTime - t0).toBeGreaterThan(1.2);
  // Five asked (the warp + four strikes); the warp lit, three in all, the rest held back.
  expect(warpLit).toBe(true);
  expect(log.allowed - log0.allowed).toBe(3);
  expect(log.refused - log0.refused).toBe(2);
  // On screen: the warp flash and the bolt washes showed, never more than 3 in a second.
  expect(r.peak.warpFlash).toBeGreaterThanOrEqual(FLASH_MIN);
  expect(r.peak.canvas).toBeGreaterThanOrEqual(FLASH_MIN);
  expect(r.perSecond).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  expect(problems).toEqual([]);
});
