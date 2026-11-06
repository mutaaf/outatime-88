// Ticket 0252: the first-race thumb guide's pulsing WARP and NOS rings never overlap each other
// and never reach another pad's centre, at any point of the pulse. Rings that can't fit side by
// side take turns, so each still gets shown. Sampled for at least 2.6 s so the pulse peak and a turn
// are both seen; measured with getBoundingClientRect, which includes the pulse's scale.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const CASES = [[390, 844], [844, 390], [768, 1024]];

for (const [width, height] of CASES) {
  test(`guide rings never overlap at ${width}x${height}`, async ({ browser }, testInfo) => {
    // A first race on a starved runner: the landscape guide holds while the coach tip shows.
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.ready());
    await page.evaluate(() => window.__OT.startRace());
    await expect(page.locator('#tcGuide .tc-guide-ring').first()).toBeAttached();
    // One evaluate samples every frame for 2.6 s (until both rings have shown, landscape phones take
    // turns, 0225, and hold while the coach tip shows: up to 60 s) and returns what it saw (no rAF promise that
    // could hang on a throw: a plain timed loop with try/finally).
    const r = await page.evaluate(() => new Promise((resolve) => {
      const out = { samples: 0, seen: {}, order: [], bad: [] };
      // Read every sample: a relayout (rotation, coach dock) can move the pads under the rings.
      const padsNow = () => [...document.querySelectorAll('#touchControlsLayer > .tc-btn:not(.tc-hidden), #tcStick:not(.tc-hidden)')]
        .map((el) => { const b = el.getBoundingClientRect(); return { id: el.id, x: b.x + b.width / 2, y: b.y + b.height / 2 }; })
        .filter((p) => p.x || p.y);
      const t0 = performance.now();
      const step = () => {
        try {
          const rings = [...document.querySelectorAll('#tcGuide .tc-guide-ring')]
            .filter((el) => getComputedStyle(el).visibility !== 'hidden')
            .map((el) => { const b = el.getBoundingClientRect(); return { k: el.dataset.k, x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 }; });
          if (rings.length) out.samples++;
          const pads = rings.length ? padsNow() : [];
          for (const g of rings) {
            if (!out.seen[g.k]) out.order.push(g.k);
            out.seen[g.k] = true;
            for (const p of pads) {
              const dist = Math.hypot(p.x - g.x, p.y - g.y);
              if (dist >= 2 && dist <= g.r) out.bad.push(`${g.k} ring (r ${g.r.toFixed(1)}) covers #${p.id}'s centre`);
            }
          }
          for (let i = 0; i < rings.length; i++) {
            for (let j = i + 1; j < rings.length; j++) {
              const a = rings[i], b = rings[j];
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              if (dist < a.r + b.r) out.bad.push(`${a.k} and ${b.k} rings overlap (${dist.toFixed(1)} < ${(a.r + b.r).toFixed(1)})`);
            }
          }
        } finally {
          const t = performance.now() - t0;
          if ((t < 2600 || (t < 60000 && !(out.seen.warp && out.seen.nos))) && document.getElementById('tcGuide')) requestAnimationFrame(step);
          else resolve(out);
        }
      };
      requestAnimationFrame(step);
    }));
    const where = `${width}x${height}`;
    expect(r.samples, `${where}: rings sampled`).toBeGreaterThan(3);
    expect([...new Set(r.bad)], `${where}: ring collisions`).toEqual([]);
    expect(Object.keys(r.seen).sort(), `${where}: rings shown`).toEqual(['nos', 'warp']);
    // Rings that take turns start with WARP (landscape phones follow the bubbles' turns instead, 0225).
    if (height >= 480) expect(r.order[0], `${where}: first ring`).toBe('warp');
    await testInfo.attach(`guide-rings-${where}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
