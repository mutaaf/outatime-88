// Zero overlaps (ticket 0021): on every screen shape we ship to, the HUD panels, the floating
// message lane and the touch controls never cover each other and never hang off-screen.
import { test, expect } from '@playwright/test';
import { APP, watchPage, HUD_PANELS } from './helpers.js';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  // Tablets in both orientations (ticket 0051): iPad mini/9.7", iPad Air, iPad Pro 12.9", 10" Android.
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1024, height: 1366 },
  { width: 1366, height: 1024 },
  { width: 800, height: 1280 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
];

// The race HUD's blocks (src/hud.js hudRects() returns the same set at runtime).
const PANELS = HUD_PANELS;
const OVERLAYS = ['#announcerMain', '#coachCard', '#driftCounterBox', '#forkLeftCard', '#forkRightCard'];
// Touch controls get their own exhaustive spec (touch-layouts.spec.js); here the default
// layout is checked alongside the HUD on the original viewport list.
const CONTROLS = ['#tcStick', '#tcBoost', '#tcDrift', '#tcJump', '#tcSpecial', '#tcPause', '#tcHorn', '#tcRear', '#tcCamera', '#tcRespawn'];
test.use({ hasTouch: true });

const overlap = (a, b) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

const discs = (a, b) => Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2) < a.width / 2 + b.width / 2 - 1;
const discBox = (d, b) => {
  const cx = d.x + d.width / 2; const cy = d.y + d.height / 2;
  const nx = Math.max(b.x, Math.min(cx, b.x + b.width)); const ny = Math.max(b.y, Math.min(cy, b.y + b.height));
  return Math.hypot(cx - nx, cy - ny) < d.width / 2 - 1;
};

async function boxes(page, sels) {
  return page.evaluate((list) => {
    const out = {};
    for (const s of list) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out[s] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return out;
  }, sels);
}

for (const vp of VIEWPORTS) {
  test(`no HUD/overlay/control overlaps at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForTimeout(600);
    // Put every floating element on screen at once so their slots can be measured.
    await page.evaluate(() => {
      window.__OT.pause(); // freeze the sim so nothing re-hides what we reveal below
      for (const id of ['interactiveCoachBanner', 'announcerMain']) document.getElementById(id).style.opacity = '1';
      document.getElementById('driftCounterBox').classList.remove('hidden');
      document.getElementById('forkChoiceBanner').classList.remove('hidden');
    });
    await page.waitForTimeout(100);
    const all = await boxes(page, [...PANELS, ...OVERLAYS, ...CONTROLS]);

    for (const [sel, b] of Object.entries(all)) {
      expect(b.x, `${sel} left edge`).toBeGreaterThanOrEqual(-1);
      expect(b.y, `${sel} top edge`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${sel} right edge`).toBeLessThanOrEqual(vp.width + 1);
      expect(b.y + b.height, `${sel} bottom edge`).toBeLessThanOrEqual(vp.height + 1);
    }
    for (const sel of PANELS) expect(all[sel], `${sel} visible`).toBeTruthy();
    for (const sel of CONTROLS) {
      expect(all[sel], `${sel} visible`).toBeTruthy();
      expect(Math.min(all[sel].width, all[sel].height), `${sel} touch target`).toBeGreaterThanOrEqual(44);
    }
    // Announcer and coach share one lane by design (never shown together), so they're not paired.
    const sameLane = (a, b) => new Set([a, b]).size === 2 && [a, b].every((s) => s === '#announcerMain' || s === '#coachCard');
    const keys = Object.keys(all);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (sameLane(keys[i], keys[j])) continue;
        const ci = CONTROLS.includes(keys[i]); const cj = CONTROLS.includes(keys[j]);
        // Touch controls are discs: compared as circles (each other) or circle-vs-box (HUD).
        const hit = ci && cj ? discs(all[keys[i]], all[keys[j]]) : ci ? discBox(all[keys[i]], all[keys[j]]) : cj ? discBox(all[keys[j]], all[keys[i]]) : overlap(all[keys[i]], all[keys[j]]);
        expect(hit, `${keys[i]} overlaps ${keys[j]}`).toBeFalsy();
      }
    }
    expect(problems).toEqual([]);
  });
}

for (const vp of [{ width: 844, height: 390 }, { width: 360, height: 640 }, { width: 1280, height: 720 }]) {
  test(`results screen fits with RACE AGAIN on screen at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__OT.GameState.score = 734210; window.__OT.finishRun(); });
    await expect(page.locator('#gameOverModal')).toBeVisible();
    for (const sel of ['#endScoreText', '#endBoardBox', '#btnPlayAgain']) {
      await expect(page.locator(sel)).toBeInViewport({ ratio: 1 });
    }
    expect(problems).toEqual([]);
  });
}
