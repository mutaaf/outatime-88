// Results actions in reach on phones (ticket 0291): on a portrait phone the PLAY AGAIN / HOME / RANKS
// row sticks to the bottom of the scrolling results card, so one more run is always one tap away,
// and it never sits on the initials box, POST or the share banner when you scroll to them.
// Desktop and landscape phones keep the row in the flow.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

async function results(page, vp) {
  const problems = watchPage(page);
  await page.setViewportSize(vp);
  // No initials yet: the card shows its tallest board (the initials form).
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ onboarded: true })), KEY);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(300); // the field is placed (as layout.spec does), so the finish order has rows
  // A score that unlocks nothing: a car unlock opens its reveal over the card (and takes focus) ~1 s later.
  await page.evaluate(() => { window.__OT.GameState.score = 734210; window.__OT.finishRun(); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await expect(page.locator('#initialsForm')).toBeVisible();
  // The finish order is filled (the card's real height), so the worst case is really tested.
  await expect(page.locator('#endPodium li').first()).toBeVisible();
  // The share banner shows once its preview is drawn; show it now so the worst case is always tested.
  await page.evaluate(() => document.getElementById('btnShare').classList.remove('hidden'));
  await page.evaluate(() => document.fonts.ready);
  return problems;
}

const rect = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
}, sel);
const scrollModal = (page, to) => page.evaluate((t) => {
  const m = document.getElementById('gameOverModal');
  m.scrollTop = t === 'end' ? m.scrollHeight : 0;
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, to);
const overlaps = (a, b) => a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right - 0.5 && b.left < a.right - 0.5;

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`PLAY AGAIN stays on screen and off the board at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = await results(page, vp);
    // The worst case is real: the card scrolls.
    expect(await page.evaluate(() => { const m = document.getElementById('gameOverModal'); return m.scrollHeight - m.clientHeight; })).toBeGreaterThan(40);
    // Focus is untouched: with no initials yet the card focuses the initials box, as before.
    await expect(page.locator('#initialsInput')).toBeFocused();

    for (const at of ['top', 'end']) {
      await scrollModal(page, at);
      const btn = await rect(page, '#btnPlayAgain');
      expect(btn.top, `PLAY AGAIN top, scrolled to ${at}`).toBeGreaterThanOrEqual(0);
      expect(btn.bottom, `PLAY AGAIN bottom, scrolled to ${at}`).toBeLessThanOrEqual(vp.height);
      expect(btn.height).toBeGreaterThanOrEqual(44);
      for (const sel of ['#btnHomeFromEnd', '#btnOpenLeaderboardFromEnd']) {
        const r = await rect(page, sel);
        expect(r.bottom, `${sel} scrolled to ${at}`).toBeLessThanOrEqual(vp.height);
        expect(r.height).toBeGreaterThanOrEqual(44);
      }
    }

    // Scrolled to from the top (as Tab or a tap would), nothing the player uses lands under the bar.
    for (const sel of ['#initialsInput', '#btnSubmitScore', '#btnShare']) {
      await scrollModal(page, 'top');
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), sel);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const [bar, el] = [await rect(page, '.end-actions'), await rect(page, sel)];
      expect(el.bottom, `${sel} on screen`).toBeLessThanOrEqual(vp.height);
      expect(overlaps(bar, el), `${sel} under the bar: ${JSON.stringify({ bar, el })}`).toBe(false);
    }
    // Tab focus too: the focused POST button scrolls clear of the bar.
    await scrollModal(page, 'top');
    await page.locator('#btnSubmitScore').focus();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(overlaps(await rect(page, '.end-actions'), await rect(page, '#btnSubmitScore'))).toBe(false);
    expect(problems).toEqual([]);
  });
}

for (const vp of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  test(`results actions stay in the flow at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = await results(page, vp);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.end-actions')).position)).toBe('static');
    await expect(page.locator('#initialsInput')).toBeFocused();
    expect(problems).toEqual([]);
  });
}
