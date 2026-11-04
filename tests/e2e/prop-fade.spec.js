// Obstacles beside the camera (ticket 0245): a laser hurdle you steered round used to pass the
// camera solid, a navy slab with a red-yellow-red band a third of the screen wide at the road
// edge (behind the JUMP/NOS buttons on a landscape phone). It now fades like near traffic (0200):
// solid up the road, where you read it, and see-through once it is past you.
// Render-only: the test holds one obstacle in place beside your lane; the player is invulnerable.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

async function startRace(page) {
  await page.goto(`${APP}?debug&view=2d`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // Every obstacle draws its ground shadow first (sprites.js), ow × 1.04 wide, under the alpha
  // the obstacle is drawn with: record its width as a share of the canvas and that alpha.
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype, orig = P.fillRect;
    window.__props = null;
    P.fillRect = function (x, y, w, h) {
      if (window.__props && this.fillStyle === 'rgba(0, 0, 0, 0.55)' && h === 4) {
        const m = this.getTransform();
        window.__props.push({ w: (Math.abs(m.a * w) / 1.04) / this.canvas.width, alpha: this.globalAlpha });
      }
      return orig.call(this, x, y, w, h);
    };
  });
}

/** Hold one obstacle (a laser hurdle) `d` units past the camera, just right of your lane, with
 *  every other obstacle and car parked far up the road; returns its draws over a few frames. */
const propAt = (page, d) => page.evaluate((d) => new Promise((done) => {
  const g = window.__OT.GameState, t = window.__OT.traffic();
  const obs = t.drawObstacles;
  if (!obs.length) { done(null); return; }
  const ob = obs[0];
  ob.type = 'LOW_LASER_BAR';
  clearInterval(window.__hold);
  window.__hold = setInterval(() => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 45;
    for (const o of obs) if (o !== ob) o.worldZ = g.trackPos + 90000;
    for (const c of t.traffic) c.worldZ = g.trackPos + 90000;
    for (const c of t.racers) c.worldZ = g.trackPos + 90000;
    ob.worldZ = g.trackPos + d; ob.offset = g.playerX + 0.6; ob.y = 0; ob.rot = 0;
  }, 5);
  setTimeout(() => {
    window.__props = [];
    let n = 4;
    (function tick() { if (n-- > 0) requestAnimationFrame(tick); else { const r = window.__props; window.__props = null; done(r); } })();
  }, 300);
}), d);

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`an obstacle beside the camera is see-through, solid up the road (${size.width}x${size.height})`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize(size);
    await startRace(page);
    await page.waitForFunction(() => window.__OT.traffic().drawObstacles.length > 0, null, { timeout: 15000 });

    // Up the road it is the solid hurdle you hop or steer round.
    const ahead = await propAt(page, 2300);
    expect(ahead && ahead.length).toBeGreaterThan(0);
    for (const p of ahead) expect(p.alpha).toBe(1);

    // On its way past the camera: translucent, wherever it lands.
    for (const d of [1000, 950, 900]) {
      const near = await propAt(page, d);
      expect(near && near.length, `drawn at ${d}`).toBeGreaterThan(0);
      for (const p of near) {
        expect(p.w, `wide at ${d}`).toBeGreaterThan(0.08); // the slab the scout saw
        expect(p.alpha, `alpha at ${d}`).toBeLessThanOrEqual(0.4);
      }
    }
    await page.screenshot({ path: info.outputPath(`prop-near-${size.width}x${size.height}.png`) });

    // Never a full-alpha prop wider than 8% of the canvas past your car: sweep it by.
    for (let d = 1400; d >= 880; d -= 40) {
      const r = await propAt(page, d);
      for (const p of r || []) if (p.alpha === 1 && p.w > 0.08) expect(d, `solid ${(p.w * 100).toFixed(0)}% wide at ${d}`).toBeGreaterThan(1100);
    }

    await page.evaluate(() => clearInterval(window.__hold));
    await nextFrames(page, 2);
    expect(problems).toEqual([]);
  });
}
