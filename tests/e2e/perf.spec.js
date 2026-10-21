import { test, expect } from '@playwright/test';
import { APP, frameStats, racing, simWait, nextFrames } from './helpers.js';

// Light perf probe: median rAF interval during a race (after a warm-up; helpers.js frameStats). Thresholds are deliberately
// generous (headless CI uses software rendering); the Keeper tracks the trend in docs/PERF.md.
test('perf probe: median frame interval during a race', { tag: '@perf' }, async ({ page }, info) => {
  await page.goto(APP);
  await page.locator('#btnStartRace').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  const st = await frameStats(page, { frames: 120, warmup: 30 });
  const ms = st.interval.p50;
  await page.keyboard.up('ArrowUp');
  info.annotations.push({ type: 'median-frame-ms', description: ms.toFixed(2) });
  console.log(`[perf] median frame interval: ${ms.toFixed(2)} ms (${(1000 / ms).toFixed(1)} fps), js p50 ${st.js.p50.toFixed(2)} ms`);
  expect(ms).toBeLessThan(100);
  expect(st.js.p50).toBeLessThan(30);
});

// Ticket 0005: the 2D frame builds no canvas gradients once its caches are warm. Counts every
// gradient/pattern created on the canvases a frame draws into (the display canvas and the road
// buffer it is blitted from) over 60 frames: plain racing (headlights, rival plumes), burning
// NOS (exhaust flames) and with a shield up (its ring). Sprite and icon caches paint into their
// own canvases, so a new car or pickup coming into view doesn't count; a gradient cached on
// first use (a rival's plume colour first seen) may, so a few frames may build one. Before the
// fix every frame built several.
test('steady-state frames create no canvas gradients', async ({ page }) => {
  await page.addInitScript(() => {
    const frame = new WeakSet();
    const log = (window.__grads = { on: false, n: 0, where: {} });
    const P = CanvasRenderingContext2D.prototype;
    const blit = P.drawImage;
    P.drawImage = function (src, ...rest) {
      // The road buffer is whatever canvas the display canvas blits with a source crop.
      if (this.canvas.id === 'gameCanvas' && rest.length === 8 && src instanceof HTMLCanvasElement) frame.add(src);
      return blit.call(this, src, ...rest);
    };
    for (const k of ['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern']) {
      const make = P[k];
      if (!make) continue;
      P[k] = function (...a) {
        if (log.on && (this.canvas.id === 'gameCanvas' || frame.has(this.canvas))) {
          log.n++;
          const at = (new Error().stack || '').split('\n')[2] || '?';
          log.where[at.trim()] = (log.where[at.trim()] || 0) + 1;
        }
        return make.apply(this, a);
      };
    }
  });
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => { window.__OT.GameState.invulnTimer = 60; });
  await simWait(page, 1.5);
  const count = async () => {
    await nextFrames(page, 20); // let anything new (a power-up ring, a flame) build its cache first
    return page.evaluate(() => new Promise((done) => {
      const log = window.__grads;
      log.n = 0; log.where = {}; log.on = true;
      let left = 60, seen = 0, frames = 0, burn = 0;
      (function tick() {
        if (log.n > seen) { frames++; seen = log.n; }
        if (window.__OT.GameState.nosBurning) burn++;
        if (--left > 0) requestAnimationFrame(tick); else { log.on = false; done({ frames, burn, n: log.n, where: log.where }); }
      })();
    }));
  };
  const expectSteady = async (what) => {
    const r = await count();
    expect(r.frames, `${what}: ${r.n} gradients from ${JSON.stringify(r.where)}`).toBeLessThanOrEqual(3);
    return r;
  };
  await expectSteady('racing');
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__OT.GameState.nosBurning);
  expect((await expectSteady('NOS')).burn, 'NOS burned through the window').toBeGreaterThan(10);
  await page.keyboard.up('Shift');
  await page.evaluate(() => window.__OT.pickup('SHIELD'));
  await page.waitForFunction(() => window.__OT.GameState.power && window.__OT.GameState.power.t.SHIELD > 0);
  await expectSteady('shield');
  expect(await page.evaluate(() => window.__OT.GameState.power.t.SHIELD)).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
});

// Ticket 0005: the cached gradients are built in a unit space and placed by the transform at
// fill time (the path is fixed when it is traced). Same pixels as a gradient built in place:
// a flame (linear, stretched) and a bloom (radial, scaled), drawn both ways in a real browser.
test('a unit gradient placed at fill time paints the same pixels as one built in place', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  const diff = await page.evaluate(() => {
    const W = 160, H = 160;
    const paint = (placed) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#101020'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const stops = (g) => { g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(96,165,250,0.9)'); g.addColorStop(0.7, 'rgba(168,85,247,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
      const x = 57.3, y = 31.7, wd = 9.4, len = 83.2;
      ctx.beginPath();
      ctx.moveTo(x - wd, y);
      ctx.quadraticCurveTo(x - wd * 0.7, y + len * 0.55, x, y + len);
      ctx.quadraticCurveTo(x + wd * 0.7, y + len * 0.55, x + wd, y);
      ctx.arc(x, y, wd, 0, Math.PI, true);
      ctx.closePath();
      if (placed) { ctx.save(); ctx.translate(x, y); ctx.scale(1, len); ctx.fillStyle = stops(ctx.createLinearGradient(0, 0, 0, 1)); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = stops(ctx.createLinearGradient(x, y, x, y + len)); ctx.fill(); }
      const bx = 110.6, by = 92.2, R = 37.9;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2);
      if (placed) { ctx.save(); ctx.translate(bx, by); ctx.scale(R, R); ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 0, 0, 0, 1)); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = stops(ctx.createRadialGradient(bx, by, 0, bx, by, R)); ctx.fill(); }
      return ctx.getImageData(0, 0, W, H).data;
    };
    const a = paint(false), b = paint(true);
    let max = 0, lit = 0;
    for (let i = 0; i < a.length; i++) { max = Math.max(max, Math.abs(a[i] - b[i])); if (i % 4 === 0 && a[i] > 40) lit++; }
    return { max, lit };
  });
  expect(diff.lit).toBeGreaterThan(500); // both shapes really drew
  expect(diff.max).toBeLessThanOrEqual(3); // rounding only
});
