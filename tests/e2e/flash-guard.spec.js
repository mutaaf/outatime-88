// Flash guard (ticket 0188): WCAG 2.3.1 allows at most three flashes in any one second. A stress
// race fires the full-screen effects together — the time warp (its flash and the era lightning),
// storm-bolt strikes, an ability tint and hits — and the flash probe (tests/e2e/helpers.js)
// counts how often the strongest flash layer rises to 0.1 opacity. Calm motion shows none at all.
import { test, expect } from '@playwright/test';
import { APP, watchPage, installFlashProbe, startFlashProbe, stopFlashProbe, flashRises, simWait, FLASH_MIN } from './helpers.js';

const SEEN = { BRIDGE: 1, WRONGWAY: 1, BEAM: 1, COLLAPSE: 1, TRAIN: 1, EDGE: 1, LIGHTNING: 1 };

async function endless(page) {
  const save = { onboarded: true, fluxCoins: 0, endless: { bestDistance: 0, bestTier: 0, runs: 3, hz: { seen: SEEN, deaths: {} } } };
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify(s)); } }, save);
  await installFlashProbe(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING' && window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.hz);
  // Cruising in the middle lane, hands off; bolts land in the next lane, so the run goes on.
  await page.evaluate(() => {
    const g = window.__OT.GameState, l = window.__OT.lateral();
    g.speed = 82; g.invulnTimer = 60; g.playerX = 0;
    (function hold() { if (g.status !== 'PLAYING') return; l.x = 0; g.playerX = 0; requestAnimationFrame(hold); })();
  });
}

/** A barrel hit that can't end the run. */
const hit = () => { const g = window.__OT.GameState; g.invulnTimer = 0; window.__OT.damage(4, 'BARREL HIT'); g.invulnTimer = 60; g.hp = Math.max(g.hp, 60); };

/** Race-clock wait that must pass with the run still going (a dead run would prove nothing). */
const play = async (page, s) => expect(await simWait(page, s)).toBe(true);

/** Everything that lights the whole screen, as close together as the game lets it happen. */
async function stress(page) {
  await startFlashProbe(page);
  // A bolt and a hit first, then the warp lands while the bolt's wash is still fading.
  await page.evaluate(() => window.__OT.hazard('LIGHTNING', 0.5, 0));
  await page.evaluate(hit);
  await play(page, 0.3);
  const before = await page.evaluate(() => window.__OT.GameState.timeWarps);
  await page.waitForFunction((b) => {
    const g = window.__OT.GameState;
    if (g.timeWarps > b) return true;
    g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
    return false;
  }, before, { timeout: 8000 });
  // Straight into an ability (its tint stays up through the rest), then hits and strikes under it.
  await page.evaluate(() => { const g = window.__OT.GameState; g.specialCharges = 3; window.__OT.input.zonePressed = true; });
  await play(page, 1.0);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(hit);
    await page.evaluate(() => window.__OT.hazard('LIGHTNING', 0.5, 2));
    await play(page, 1.0);
  }
  await page.evaluate(() => { window.__OT.input.agroPressed = true; });
  await play(page, 0.6);
  expect(await page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  return flashRises(await stopFlashProbe(page));
}

test('the probe sees every pulse of a frame-locked strobe', async ({ page }) => {
  await endless(page);
  await startFlashProbe(page);
  // On one frame, off the next, for 24 frames: 12 pulses at any frame rate.
  await page.evaluate(() => new Promise((done) => {
    const el = document.getElementById('warpFlash');
    el.style.transition = 'none';
    let n = 0;
    (function tick() {
      el.style.opacity = n % 2 ? '0' : '0.5';
      if (n++ < 24) requestAnimationFrame(tick); else { el.style.opacity = '0'; requestAnimationFrame(() => requestAnimationFrame(done)); }
    })();
  }));
  const r = flashRises(await stopFlashProbe(page));
  expect(r.flashes).toBeGreaterThanOrEqual(11);
  expect(r.peak.warpFlash).toBeCloseTo(0.5);
});

test('full motion: a stress race never flashes more than 3 times in any second', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await endless(page);
  expect(await page.evaluate(() => window.__OT.GameState.reducedMotion)).toBe(false);
  const r = await stress(page);
  // The run did light the screen: the warp flash, bolt washes (also under the ability tint) and the tint.
  expect(r.peak.warpFlash).toBeGreaterThanOrEqual(FLASH_MIN);
  expect(r.peak.canvas).toBeGreaterThanOrEqual(FLASH_MIN);
  expect(r.peak.abilityTintOverlay).toBeGreaterThanOrEqual(FLASH_MIN);
  expect(r.flashes).toBeGreaterThanOrEqual(3);
  expect(r.perSecond).toBeLessThanOrEqual(3);
  expect(problems).toEqual([]);
});

test('calm motion: the same stress race shows no flash layer at 0.1 or above', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await endless(page);
  expect(await page.evaluate(() => window.__OT.GameState.reducedMotion)).toBe(true);
  const r = await stress(page);
  // Every effect still shows, just softly.
  for (const [layer, peak] of Object.entries(r.peak)) {
    expect(peak, layer).toBeGreaterThan(0);
    expect(peak, layer).toBeLessThan(FLASH_MIN);
  }
  expect(r.flashes).toBe(0);
  expect(problems).toEqual([]);
});
