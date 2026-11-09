// Ticket 0255: the floating ±N HP pop sits on a dark plate, so it reads (≥ 4.5:1) over any sky,
// and over its whole pop-and-drift it stays on screen and off every other HUD block.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

const SIZES = [
  { name: 'desktop 1280x720', use: { viewport: { width: 1280, height: 720 } } },
  { name: 'phone 390x844', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  // HUD LARGE on a portrait phone puts the gap/clock row right under the place card (0195).
  { name: 'phone 430x932 HUD LARGE', large: true, use: { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use(size.use);

    test('the HP pop is plated, readable and clear of the HUD for its whole float', async ({ page }) => {
      const problems = watchPage(page);
      await page.goto(`${APP}?debug`);
      await page.locator('#btnStartRace').click();
      await page.waitForFunction(() => window.__OT.GameState.racePhase === 'RACING', null, { timeout: 30_000 });
      if (size.large) await page.evaluate(() => { document.documentElement.dataset.hudSize = 'large'; });
      for (const kind of ['hit', 'heal']) {
        // Sample every frame from the change until the pop has faded (0.9 s, 1.4 s with calm motion).
        const out = await page.evaluate((kind) => new Promise((resolve) => {
          const pop = document.getElementById('hudHpPop');
          const g = window.__OT.GameState;
          g.invulnTimer = 0;
          if (kind === 'hit') window.__OT.damage(20); else window.__OT.heal(12);
          const samples = [];
          // Worst-case gap pills (both shown, long names), re-written every frame over the HUD's own writes.
          const pills = () => { for (const id of ['hudGapAhead', 'hudGapBehind']) document.getElementById(id).textContent = '▲ NEMESIS +12.3s'; };
          pills();
          const t0 = performance.now();
          const step = () => {
            try {
              pills();
              const cs = getComputedStyle(pop);
              if (+cs.opacity > 0.05) {
                const r = pop.getBoundingClientRect();
                samples.push({ t: performance.now() - t0, o: +cs.opacity, x: r.x, y: r.y, width: r.width, height: r.height });
              }
              if (performance.now() - t0 < 1600) return requestAnimationFrame(step);
              const card = pop.parentElement.closest('[data-hud-rect]').getBoundingClientRect();
              const others = [];
              const add = (n) => {
                const r = n.getBoundingClientRect();
                if (r.width && r.height) others.push({ id: n.id || n.className, x: r.x, y: r.y, width: r.width, height: r.height });
              };
              for (const n of document.querySelectorAll('[data-hud-rect]')) {
                if (n.contains(pop)) continue;
                // On a portrait HUD LARGE the times are a full-width row whose empty ends are open sky:
                // what must stay clear there is its pills and clock.
                if (n.id === 'hudTimes') { for (const c of n.children) if (getComputedStyle(c).display !== 'none') add(c); } else add(n);
              }
              resolve({ dur: parseFloat(cs.animationDuration) * 1000, cardBottom: card.bottom, text: pop.textContent, fx: pop.dataset.fx, bg: cs.backgroundColor, color: cs.color, samples, others,
                vw: innerWidth, vh: innerHeight });
            } catch (e) { resolve({ error: String(e) }); }
          };
          requestAnimationFrame(step);
        }), kind);
        expect(out.error).toBeUndefined();
        expect(out.fx).toMatch(new RegExp(`^${kind}`));
        expect(out.text).toMatch(kind === 'hit' ? /^−\d+ HP$/ : /^\+\d+ HP$/);
        expect(out.samples.length, 'pop seen').toBeGreaterThan(2);

        // Contrast: the plate composited over white (the worst sky) and over black.
        const rgba = (s) => { const p = s.match(/[\d.]+/g).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const plate = rgba(out.bg), text = rgba(out.color);
        expect(plate[3], 'plate alpha').toBeGreaterThanOrEqual(0.85);
        for (const back of [255, 0]) {
          const under = plate.slice(0, 3).map((c) => c * plate[3] + back * (1 - plate[3]));
          expect(ratio(text, under), `${kind} contrast over ${back}`).toBeGreaterThanOrEqual(4.5);
        }

        // It holds full strength for the first part of its life (the fade takes the contrast with it):
        // every frame seen in the first 0.3 s after it lit is fully opaque.
        const lit = out.samples[0].t;
        for (const s of out.samples) if (s.t - lit < 300 && s.t - lit < out.dur * 0.35) expect(s.o, `${kind} opacity at ${Math.round(s.t - lit)} ms`).toBeGreaterThan(0.99);

        // Geometry: on screen, below its own card, and never over another HUD block, on any sampled frame.
        const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        for (const s of out.samples) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.x + s.width).toBeLessThanOrEqual(out.vw);
          expect(s.y + s.height).toBeLessThanOrEqual(out.vh);
          expect(s.y, `${kind} pop over its place card`).toBeGreaterThanOrEqual(out.cardBottom - 0.5);
          for (const o of out.others) expect(hit(s, o), `${kind} pop over #${o.id}`).toBeFalsy();
        }
      }
      expect(problems).toEqual([]);
    });
  });
}
