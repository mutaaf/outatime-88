// The results SCORE sub-line reflows instead of clipping (ticket 0290): "CLEAN RUN — NO
// PENALTIES ✨" and a long "earned − penalty (why)" line wrap inside the SCORE card on phones,
// the card grows, and the PLACE card beside it stays the same height. Desktop is unchanged.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';

// A run that lost points every way the line can name: hits, crashes, cones and wall time.
const DIRTY = { obstacle: [60, 72], traffic: [80, 95, 110], cone: [30, 34, 41], wallMs: 12300, wallN: 3, wallBill: 1500 };

async function finish(page, vp, log) {
  await page.setViewportSize(vp);
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true })), KEY);
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT?.startRace);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForTimeout(300);
  // 734,210 unlocks no car (a reveal would cover the card a second later).
  await page.evaluate((pen) => {
    const G = window.__OT.GameState;
    if (pen) Object.assign(G.penaltyLog, JSON.parse(JSON.stringify(pen)));
    G.score = 734210;
    window.__OT.finishRun();
  }, log);
  await expect(page.locator('#gameOverModal')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Overflow and containment of the sub-line, and the SCORE / PLACE card heights. */
function measure(page) {
  return page.evaluate(() => {
    const el = document.getElementById('endPenaltyText');
    const card = el.closest('.led-box');
    const place = document.getElementById('endWarpsText').closest('.led-box');
    const c = card.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const outside = [...range.getClientRects()].filter((r) => r.width > 0
      && (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)).length;
    const score = document.getElementById('endScoreText').getBoundingClientRect();
    const sub = el.getBoundingClientRect();
    // Each "2 HITS"-style reason must sit on one line: its first and last glyph share a top.
    const splitCounts = [];
    const t = el.firstChild;
    for (const mm of el.textContent.matchAll(/\d+(\.\d)?s?\u00a0[A-Z]+/g)) {
      const a = document.createRange(); a.setStart(t, mm.index); a.setEnd(t, mm.index + 1);
      const z = document.createRange(); z.setStart(t, mm.index + mm[0].length - 1); z.setEnd(t, mm.index + mm[0].length);
      if (Math.abs(a.getBoundingClientRect().top - z.getBoundingClientRect().top) > 2) splitCounts.push(mm[0]);
    }
    return {
      splitCounts,
      text: el.textContent,
      cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      outside,
      overlapsScore: sub.top < score.bottom - 0.5,
      lines: new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size,
      scoreH: c.height,
      placeH: place.getBoundingClientRect().height,
      fontPx: parseFloat(getComputedStyle(el).fontSize),
    };
  });
}

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  for (const kind of ['clean', 'dirty']) {
    test(`the ${kind} score sub-line wraps uncut at ${vp.width}x${vp.height}`, async ({ page }) => {
      const problems = watchPage(page);
      await finish(page, vp, kind === 'dirty' ? DIRTY : null);
      const m = await measure(page);
      if (kind === 'clean') expect(m.text).toBe('CLEAN RUN — NO PENALTIES ✨');
      else {
        expect(m.text).toMatch(/\(2 HITS · 3 CRASHES · 3 CONES · 12\.3s WALL\)$/);
        // A count stays on the line of its word.
        expect(m.splitCounts).toEqual([]);
      }
      expect(m.cut).toBe(false);
      expect(m.outside).toBe(0);
      expect(m.overlapsScore).toBe(false);
      expect(m.fontPx).toBeGreaterThanOrEqual(8);
      expect(Math.abs(m.scoreH - m.placeH)).toBeLessThanOrEqual(1);
      expect(problems).toEqual([]);
    });
  }
}

test('at 1280x720 the clean sub-line stays one line in its card', async ({ page }) => {
  const problems = watchPage(page);
  await finish(page, { width: 1280, height: 720 }, null);
  const m = await measure(page);
  expect(m.cut).toBe(false);
  expect(m.outside).toBe(0);
  expect(m.lines).toBe(1);
  expect(Math.abs(m.scoreH - m.placeH)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});
