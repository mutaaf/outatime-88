// Marquee ads (owner decision 2026-10-30, AGENTS.md §3.3, docs/ADS.md § Marquee): ads only in menus.
// A stubbed same-origin loader records every call with the game's status at that moment: the
// rewarded 2× COINS is opt-in on the results card, the interstitial fires on the way back to the
// title from the second race on, and nothing is ever asked for during a race.
import { test, expect } from '@playwright/test';
import { APP, watchPage, stubAds } from './helpers.js';

const G = (page, fn, arg) => page.evaluate(fn, arg);
const status = (page) => G(page, () => window.__OT.GameState.status);

// A fake loader: fill on postrace + bonus, each break runs its hooks and resolves (rewarded: earned).
const FAKE = `(() => {
  const calls = window.__adCalls = [];
  const log = (kind, id) => { const g = window.__OT && window.__OT.GameState; calls.push({ kind, id, status: g ? g.status : '?', mode: g ? g.mode : '?' }); };
  const brk = (kind, id, h, out) => { log(kind, id); h.beforeAd(); window.__adHeld = true;
    return new Promise((r) => setTimeout(() => { window.__adHeld = false; h.afterAd(); r(out); }, 150)); };
  window.marquee = { v: 1,
    ready: () => Promise.resolve({ enabled: true, slots: { title: { source: 'none' }, postrace: { source: 'direct', every: 0 }, bonus: { source: 'direct' } } }),
    interstitial: (id, h) => brk('interstitial', id, h).then(() => undefined),
    rewarded: (id, h) => brk('rewarded', id, h, true),
  };
})();`;

async function boot(page, loader = FAKE) {
  const problems = watchPage(page);
  await stubAds(page, loader); // registered after watchPage's empty stub, so it wins
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, fluxCoins: 100 })));
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT && window.__OT.home());
  return problems;
}

/** One solo race, with a probe that fails if any ad call happens while it is on. */
async function raceToResults(page, coins = 40) {
  await G(page, () => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
  await expect.poll(() => status(page)).toBe('PLAYING');
  const before = await G(page, () => (window.__adCalls || []).length);
  await page.waitForTimeout(400);
  expect(await G(page, () => (window.__adCalls || []).length)).toBe(before);
  await G(page, (c) => { window.__OT.GameState.runCoins = c; window.__OT.finishRun(); }, coins);
  await expect(page.locator('#gameOverModal')).toBeVisible();
}

test('the loader is same-origin, relative to the base path, with the menu slots declared', async ({ page }) => {
  const problems = await boot(page, '/* empty */');
  const src = await page.locator('script[data-app="outatime"]').getAttribute('src');
  expect(src).toBe('../ads/v1/ads.js');
  expect(new URL(src, page.url()).pathname).toBe('/ads/v1/ads.js');
  const slots = await page.locator('script[data-app="outatime"]').getAttribute('data-slots');
  for (const s of slots.split(',')) expect(s.split(':')[2]).toBe('menu'); // never a gameplay slot
  await expect(page.locator('#titleScreen [data-marquee="title"]')).toHaveAttribute('data-marquee-context', 'menu');
  expect(problems).toEqual([]);
});

test('no loader: a race, its results and the way home all work, with no offer and no errors', async ({ page }) => {
  const problems = await boot(page, '/* blocked */');
  await raceToResults(page);
  await page.waitForTimeout(300);
  await expect(page.locator('#btnBonusAd')).toBeHidden();
  await page.locator('#btnHomeFromEnd').click();
  await expect.poll(() => status(page)).toBe('TITLE');
  expect(problems).toEqual([]);
});

test('rewarded 2× coins is opt-in on results; the interstitial skips race 1 and never fires mid-race', async ({ page }) => {
  const problems = await boot(page);
  await raceToResults(page, 40);
  const offer = page.locator('#btnBonusAd');
  await expect(offer).toBeVisible();
  await expect(offer).toHaveText(/Watch a short ad for 2× coins/);
  expect(await G(page, () => window.__adCalls.length)).toBe(0); // nothing until the player taps
  const flux = await G(page, () => window.__OT.save().fluxCoins);
  await offer.click();
  await expect(offer).toBeHidden();
  const earned = await G(page, () => window.__OT.GameState.runCoins);
  expect(await G(page, () => window.__OT.save().fluxCoins)).toBe(flux + earned / 2);
  await expect(page.locator('#endCoinsText')).toContainText('2×');

  // First race of the session: home with no interstitial.
  await page.locator('#btnHomeFromEnd').click();
  await expect.poll(() => status(page)).toBe('TITLE');
  await page.waitForTimeout(300);
  expect((await G(page, () => window.__adCalls)).filter((c) => c.kind === 'interstitial')).toEqual([]);

  // Second race: the interstitial fires on the way home, on the title, and holds the loop.
  await raceToResults(page, 0);
  await expect(offer).toBeHidden(); // no coins, no offer
  await page.locator('#btnHomeFromEnd').click();
  await expect.poll(() => G(page, () => window.__adCalls.filter((c) => c.kind === 'interstitial').length)).toBe(1);
  await expect.poll(() => G(page, () => window.__adHeld)).toBe(false);

  const calls = await G(page, () => window.__adCalls);
  expect(calls.map((c) => `${c.kind}:${c.id}`)).toEqual(['rewarded:bonus', 'interstitial:postrace']);
  for (const c of calls) {
    expect(['TITLE', 'GAMEOVER']).toContain(c.status);
    expect(c.mode).not.toBe('LIVE');
  }
  expect(problems).toEqual([]);
});

test('TV mode never shows a break', async ({ page }) => {
  const problems = watchPage(page);
  await stubAds(page, FAKE);
  await page.goto(`${APP}?debug&tv`);
  await page.waitForFunction(() => window.__OT && window.__OT.home());
  for (let i = 0; i < 2; i++) {
    await G(page, () => window.__OT.startRace({ mode: 'INFINITE', quick: true }));
    await expect.poll(() => status(page)).toBe('PLAYING');
    await G(page, () => { window.__OT.GameState.runCoins = 20; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    await page.locator('#btnHomeFromEnd').dispatchEvent('click'); // the TV pairing card covers the results
    await expect.poll(() => status(page)).toBe('TITLE');
  }
  await page.waitForTimeout(300);
  await expect(page.locator('#btnBonusAd')).toBeHidden();
  expect(await G(page, () => (window.__adCalls || []).length)).toBe(0);
  expect(problems.filter((p) => !/api\/pad/.test(p))).toEqual([]);
});
