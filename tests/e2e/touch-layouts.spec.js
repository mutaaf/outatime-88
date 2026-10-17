// Every touch preset on every screen we ship to (ticket 0061): all controls on screen, ≥44 px,
// never on each other, the HUD panels or the floating message lane, in both orientations.
// Screenshots of each preset at phone and tablet sizes are attached to the report.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const VIEWPORTS = [
  [390, 844], [360, 640], [430, 932], [844, 390], [667, 375],
  [768, 1024], [1024, 768], [820, 1180], [1180, 820], [1024, 1366], [1366, 1024], [800, 1280], [1280, 800],
];
const SHOTS = new Set(['390x844', '844x390', '820x1180', '1180x820']);
const PRESETS = ['default', 'roblox', 'fortnite', 'lefty', 'claw', 'tablet'];
const HUD = ['#leftHudPanel', '#centerHudPanel', '#rightHudPanel', '#announcerMain', '#coachCard', '#driftCounterBox', '#forkLeftCard', '#forkRightCard'];
const SAME_LANE = new Set(['#announcerMain', '#coachCard']);

const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
// Controls are discs: compare as circles with each other, as circle-vs-box against the HUD.
const discsTouch = (a, b) => Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2) < a.width / 2 + b.width / 2 - 1;
const discHitsBox = (d, b) => {
  const cx = d.x + d.width / 2; const cy = d.y + d.height / 2; const r = d.width / 2 - 1;
  const nx = Math.max(b.x, Math.min(cx, b.x + b.width)); const ny = Math.max(b.y, Math.min(cy, b.y + b.height));
  return Math.hypot(cx - nx, cy - ny) < r;
};

for (const [width, height] of VIEWPORTS) {
  test(`touch presets fit at ${width}x${height}`, async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ bestScore: 1, controls: { coachSeen: true } })));
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__OT.pause();
      for (const id of ['interactiveCoachBanner', 'announcerMain']) document.getElementById(id).style.opacity = '1';
      document.getElementById('driftCounterBox').classList.remove('hidden');
      document.getElementById('forkChoiceBanner').classList.remove('hidden');
    });
    for (const preset of PRESETS) {
      for (const autoAccel of [true, false]) {
        const r = await page.evaluate(([p, a, hud]) => {
          const c = window.__OT.controls();
          c.preset = p; c.movement = ''; c.autoAccel = a;
          window.__OT.touch().applySettings();
          const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
          const controls = {};
          for (const el of document.querySelectorAll('#touchControlsLayer > .tc-btn:not(.tc-hidden), #tcStick:not(.tc-hidden)')) controls[`#${el.id}`] = box(el);
          const panels = {};
          for (const s of hud) { const el = document.querySelector(s); if (el && el.getBoundingClientRect().width && getComputedStyle(el).display !== 'none') panels[s] = box(el); }
          return { controls, panels };
        }, [preset, autoAccel, HUD]);
        const where = `${preset}${autoAccel ? '' : '+gas'} @ ${width}x${height}`;
        const ids = Object.keys(r.controls);
        expect(ids.length, `${where}: controls shown`).toBeGreaterThanOrEqual(autoAccel ? 9 : 10);
        for (const [id, b] of Object.entries(r.controls)) {
          expect(b.x, `${where} ${id} left`).toBeGreaterThanOrEqual(-1);
          expect(b.y, `${where} ${id} top`).toBeGreaterThanOrEqual(-1);
          expect(b.x + b.width, `${where} ${id} right`).toBeLessThanOrEqual(width + 1);
          expect(b.y + b.height, `${where} ${id} bottom`).toBeLessThanOrEqual(height + 1);
          expect(Math.min(b.width, b.height), `${where} ${id} touch target`).toBeGreaterThanOrEqual(44);
          for (const [pid, p] of Object.entries(r.panels)) expect(discHitsBox(b, p), `${where}: ${id} covers ${pid}`).toBeFalsy();
        }
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) expect(discsTouch(r.controls[ids[i]], r.controls[ids[j]]), `${where}: ${ids[i]} overlaps ${ids[j]}`).toBeFalsy();
        }
        const pids = Object.keys(r.panels);
        for (let i = 0; i < pids.length; i++) {
          for (let j = i + 1; j < pids.length; j++) {
            if (SAME_LANE.has(pids[i]) && SAME_LANE.has(pids[j])) continue;
            expect(overlap(r.panels[pids[i]], r.panels[pids[j]]), `${where}: ${pids[i]} overlaps ${pids[j]}`).toBeFalsy();
          }
        }
        if (autoAccel && SHOTS.has(`${width}x${height}`)) {
          await testInfo.attach(`${preset}-${width}x${height}.png`, { body: await page.screenshot(), contentType: 'image/png' });
        }
      }
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
