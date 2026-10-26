// HUD size (ticket 0195): Settings → HUD SIZE → LARGE grows the numbers a racer reads at speed
// (place, lap, gaps, clock, mph) by 1.3x for low-vision and younger players. NORMAL stays the
// compact default, the choice survives a reload, and LARGE still lays the HUD out with every
// block on screen and nothing on top of anything else, worst-case text included.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const SAVE = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE);
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('HUD SIZE is NORMAL by default, LARGE by keyboard, and LARGE survives a reload', async ({ page }) => {
  const problems = watchPage(page);
  // A save from before 0195: its settings have no HUD size at all.
  await page.addInitScript((k) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(k, JSON.stringify({ settings: { motion: 'auto', difficulty: 'normal', coach: true, keys: null } }));
  }, SAVE);
  await page.goto(`${APP}?debug`);
  expect(await page.evaluate(() => document.documentElement.dataset.hudSize)).toBe('normal');
  await page.locator('#btnOpenSettings').click();
  const normal = page.locator('[data-setting="hud"] [data-value="normal"]');
  const large = page.locator('[data-setting="hud"] [data-value="large"]');
  await expect(normal).toHaveAttribute('aria-pressed', 'true');
  await expect(large).toHaveAttribute('aria-pressed', 'false');

  // Keyboard path: focus moves to the button and Enter picks it.
  await large.focus();
  await page.keyboard.press('Enter');
  await expect(large).toHaveAttribute('aria-pressed', 'true');
  await expect(normal).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.dataset.hudSize)).toBe('large');
  expect(await page.evaluate(() => window.__OT.GameState.status)).not.toBe('PLAYING'); // Enter stayed in the panel
  expect((await saved(page)).settings.hud).toBe('large');

  await page.reload();
  // Applied at boot, before the panel's chunk is ever fetched.
  expect(await page.evaluate(() => document.documentElement.dataset.hudSize)).toBe('large');
  await page.locator('#btnOpenSettings').click();
  await expect(large).toHaveAttribute('aria-pressed', 'true');
  // Tilt status text still lands now that it comes from the panel's chunk.
  await expect(page.locator('#tiltStatus')).toContainText(/tilt/i);
  await normal.click();
  expect(await page.evaluate(() => document.documentElement.dataset.hudSize)).toBe('normal');
  expect(problems).toEqual([]);
});

// Every viewport the ticket names, plus the narrowest phones and a portrait tablet (0190/0202).
const VIEWPORTS = [
  { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 },
  { width: 360, height: 740 }, { width: 320, height: 568 }, { width: 600, height: 960 }, { width: 768, height: 1024 }, { width: 820, height: 1180 },
];
for (const vp of VIEWPORTS) {
  test(`LARGE HUD grows the speed readout and keeps every block on screen, apart, at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ settings: { hud: 'large' } })), SAVE);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' })); // a timed race: the clock shows too
    await racing(page, { minTime: 0.5 });
    await page.evaluate(() => {
      window.__OT.pause();
      // Worst case (0190/0202): a nemesis ahead, a rival behind, a long race, WARP READY, a 7-digit score.
      const compact = matchMedia('(max-width: 599px) and (orientation: portrait)').matches;
      document.getElementById('hudGapAhead').textContent = compact ? '▲ 😈+0.1s' : '▲ 😈RIN +0.1s';
      document.getElementById('hudGapBehind').textContent = compact ? '▼ −9.9s' : '▼ VEX −9.9s';
      document.getElementById('hudTime').textContent = '9:59.9';
      document.getElementById('hudClock').textContent = '60';
      document.getElementById('hudFluxLabel').textContent = '⚡ WARP READY';
      document.getElementById('hudScore').textContent = `${(1234567).toLocaleString()} PTS`;
      document.getElementById('hudPos').textContent = '2ND';
      document.getElementById('hudSpeed').textContent = '188';
    });
    await page.waitForTimeout(200); // a running HUD would overwrite the text within a tick

    const m = await page.evaluate(() => {
      const root = document.documentElement;
      const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      const sizes = () => ({ speed: px('#hudSpeed'), place: px('#hudPos'), gap: px('#hudGapAhead'), time: px('#hudTime') });
      const large = sizes();
      root.dataset.hudSize = 'normal';
      const normal = sizes();
      root.dataset.hudSize = 'large';
      const R = (el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.className, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      // The HUD's blocks (src/hud.js hudRects()).
      const rects = [...document.querySelectorAll('[data-hud-rect]')].map(R).filter((r) => r.width && r.height);
      // Text that must stay whole and inside its own card.
      const clipped = ['#hudGapAhead', '#hudGapBehind', '#hudTime', '#hudClockWrap', '#hudTimes', '#hudPos', '#hudLap', '#hudSpeed', '#hudFluxLabel', '#hudScore']
        .map((s) => document.querySelector(s)).filter(shown).filter((el) => el.scrollWidth - el.clientWidth > 0).map((el) => el.id);
      const spills = [];
      const times = R(document.getElementById('hudTimes'));
      for (const [card, parts] of [['hudPosCard', ['hudPos', 'hudPosOf', 'hudLap']], ['hudSpeedCard', ['hudSpeed', 'hudFluxLabel', 'hudScore']]]) {
        const c = R(document.getElementById(card));
        for (const id of parts) {
          const r = R(document.getElementById(id));
          if (r.x < c.x - 0.5 || r.right > c.right + 0.5) spills.push(`${id} outside ${card}`);
          if (r.x < times.right && times.x < r.right && r.y < times.bottom && times.y < r.bottom) spills.push(`${id} over the times`);
        }
      }
      const timeParts = ['hudGapAhead', 'hudGapBehind', 'hudClockWrap'].map((id) => document.getElementById(id)).filter(shown).map(R);
      return { large, normal, rects, clipped, spills, timeParts, header: R(document.querySelector('header')), pageWidth: root.scrollWidth, vw: innerWidth, vh: innerHeight };
    });

    expect(m.large.speed / m.normal.speed, 'speed readout grows').toBeGreaterThanOrEqual(1.25);
    expect(m.large.place / m.normal.place, 'place grows').toBeGreaterThanOrEqual(1.25);
    expect(m.large.gap / m.normal.gap, 'gap pill grows').toBeGreaterThanOrEqual(1.25);
    expect(m.large.time / m.normal.time, 'race time grows').toBeGreaterThanOrEqual(1.25);
    expect(m.rects.length).toBeGreaterThanOrEqual(5);
    for (const r of m.rects) {
      expect(r.x, `${r.id} off the left edge`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${r.id} off the top`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${r.id} off the right edge`).toBeLessThanOrEqual(m.vw);
      expect(r.bottom, `${r.id} off the bottom`).toBeLessThanOrEqual(m.vh);
    }
    for (let i = 0; i < m.rects.length; i++) {
      for (let j = i + 1; j < m.rects.length; j++) {
        expect(intersects(m.rects[i], m.rects[j]), `${m.rects[i].id} overlaps ${m.rects[j].id}`).toBeFalsy();
      }
    }
    for (const p of m.timeParts) {
      for (const r of m.rects.filter((x) => x.id !== 'hudTimes')) expect(intersects(p, r), `${p.id} overlaps ${r.id}`).toBeFalsy();
    }
    expect(m.clipped, 'text cut off').toEqual([]);
    expect(m.spills).toEqual([]);
    expect(m.pageWidth).toBeLessThanOrEqual(m.vw);
    // The road stays the point: even LARGE leaves most of the screen to the race (a third on the shortest phones).
    expect(m.header.bottom).toBeLessThanOrEqual(m.vh * (m.vh < 640 ? 1 / 3 : 0.3));
    await page.screenshot({ path: test.info().outputPath(`hud-large-${vp.width}x${vp.height}.png`) });
    expect(problems).toEqual([]);
  });
}

// The touch kit lays its controls out below the HUD's bottom edge (src/touch/touch-ui.js): the
// bigger HUD must push them down, never sit on them.
const discHitsBox = (d, b) => {
  const cx = d.x + d.width / 2; const cy = d.y + d.height / 2; const r = d.width / 2 - 1;
  const nx = Math.max(b.x, Math.min(cx, b.x + b.width)); const ny = Math.max(b.y, Math.min(cy, b.y + b.height));
  return Math.hypot(cx - nx, cy - ny) < r;
};
for (const [width, height] of [[390, 844], [844, 390], [667, 375], [768, 1024]]) {
  test(`LARGE HUD keeps clear of the touch controls at ${width}x${height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ bestScore: 1, controls: { coachSeen: true }, settings: { hud: 'large' } })), SAVE);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await page.waitForFunction(() => document.querySelectorAll('#touchControlsLayer > .tc-btn:not(.tc-hidden)').length > 0, null, { timeout: 20000 });
    await page.evaluate(() => window.__OT.pause());
    await page.waitForTimeout(300); // a header resize re-lays the controls on the next frame
    const r = await page.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { id: el.id, x: b.x, y: b.y, width: b.width, height: b.height }; };
      return {
        large: document.documentElement.dataset.hudSize,
        controls: [...document.querySelectorAll('#touchControlsLayer > .tc-btn:not(.tc-hidden), #tcStick:not(.tc-hidden)')].map(box),
        hud: [...document.querySelectorAll('[data-hud-rect]')].map(box).filter((b) => b.width && b.height),
      };
    });
    expect(r.large).toBe('large');
    expect(r.controls.length).toBeGreaterThanOrEqual(9);
    for (const c of r.controls) {
      expect(c.y + c.height, `${c.id} bottom`).toBeLessThanOrEqual(height + 1);
      for (const h of r.hud) expect(discHitsBox(c, h), `${c.id} sits on ${h.id}`).toBeFalsy();
    }
    await page.screenshot({ path: test.info().outputPath(`hud-large-touch-${width}x${height}.png`) });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
