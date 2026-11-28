// "Reduce transparency" (ticket 0308): with the OS setting on, the panels that sit over the moving
// road (HUD plates, announcer, coach tip, pause sheet, results card) paint an opaque fill with no
// backdrop blur, and the text on those fills keeps 4.5:1. Without it they stay translucent.
// Playwright's emulateMedia has no reducedTransparency option, so Chromium's CDP sets the feature.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
// coachSeen: the coach tip stays up mid-race (nothing waits on the thumb guide).
const SAVE = JSON.stringify({ initials: 'CLD', onboarded: true, controls: { coachSeen: true } });
const RACE = ['#hudPosCard', '#hudTrack', '#hudSpeedCard', '.hud-clockbox', '#btnHudSettings', '#coachCard'];

async function emulate(page, value) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value }] });
}

// For each selector: is its own fill opaque, is there a backdrop filter, and the worst contrast of
// the text painted straight on that fill (text over a child's own plate is that plate's business).
function probe(sels) {
  const nums = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const alphaOf = (c) => { const n = nums(c); return n.length > 3 ? n[3] : 1; };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  return sels.map((sel) => {
    const el = document.querySelector(sel);
    if (!el || !el.checkVisibility()) return { sel, shown: false };
    const cs = getComputedStyle(el);
    const img = cs.backgroundImage;
    const stops = img === 'none' ? [] : (img.match(/rgba?\([^)]+\)|transparent/g) || []);
    const imgAlpha = Math.min(1, ...stops.map((c) => (c === 'transparent' ? 0 : alphaOf(c))));
    const bgAlpha = alphaOf(cs.backgroundColor);
    // Opaque: a solid colour, or a gradient of solid stops (over which the colour doesn't show).
    const opaque = bgAlpha === 1 || (stops.length > 0 && imgAlpha === 1);
    const fill = bgAlpha === 1 || !stops.length ? nums(cs.backgroundColor) : nums(stops[0]);
    let worst = Infinity;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!/[A-Za-z0-9]/.test(t.textContent)) continue;
      const p = t.parentElement;
      if (!p.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      let painted = false;
      for (let n = p; n && n !== el; n = n.parentElement) {
        const ncs = getComputedStyle(n);
        if (alphaOf(ncs.backgroundColor) > 0 || ncs.backgroundImage !== 'none') { painted = true; break; }
      }
      if (painted) continue;
      worst = Math.min(worst, ratio(nums(getComputedStyle(p).color), fill));
    }
    const bf = cs.backdropFilter;
    return { sel, shown: true, opaque, blur: !!bf && bf !== 'none', contrast: worst };
  });
}

async function raceStates(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await expect(page.locator('#coachCard')).toBeVisible();
  const race = await page.evaluate(probe, RACE);
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeVisible();
  const pause = await page.evaluate(probe, ['#garageModal']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#garageModal')).toBeHidden();
  await page.evaluate(() => { window.__OT.GameState.score = 734210; window.__OT.finishRun(); });
  await expect(page.locator('#gameOverModal')).toBeVisible();
  const results = await page.evaluate(probe, ['#gameOverModal']);
  return [...race, ...pause, ...results];
}

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`reduced transparency at ${vp.width}x${vp.height}: race, pause and results panels are opaque`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript(([k, s]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, s); }, [KEY, SAVE]);
    await emulate(page, 'reduce');
    await page.goto(`${APP}?debug`);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
    const rows = await raceStates(page);
    for (const r of rows) {
      expect(r.shown, `${r.sel} shown`).toBe(true);
      expect(r.opaque, `${r.sel} opaque fill`).toBe(true);
      expect(r.blur, `${r.sel} backdrop-filter`).toBe(false);
      if (Number.isFinite(r.contrast)) expect(r.contrast, `${r.sel} text contrast`).toBeGreaterThanOrEqual(4.5);
    }
    expect(problems).toEqual([]);
  });
}

test('without the setting the panels stay translucent', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(([k, s]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, s); }, [KEY, SAVE]);
  await emulate(page, 'no-preference');
  const rows = await raceStates(page);
  const by = Object.fromEntries(rows.map((r) => [r.sel, r]));
  for (const sel of ['#hudPosCard', '#hudTrack', '.hud-clockbox', '#coachCard', '#garageModal', '#gameOverModal']) {
    expect(by[sel].shown, `${sel} shown`).toBe(true);
    expect(by[sel].opaque, `${sel} still translucent`).toBe(false);
  }
  expect(by['#garageModal'].blur && by['#gameOverModal'].blur).toBe(true);
  expect(problems).toEqual([]);
});
