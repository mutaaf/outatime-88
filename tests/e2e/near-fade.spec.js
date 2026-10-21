// Near-camera traffic (ticket 0200): a semi passing beside the camera eases down to under a
// quarter of the canvas and turns translucent, so the road edge and the traffic ahead stay
// readable; the same semi further up the road is drawn exactly as before. Render-only: the
// semi is held in place by the test, the player is invulnerable, nothing in the sim changes.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

async function startRace(page) {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // Record every semi sprite blitted in screen space (car sprites carry their thrust kind, and
  // only the semi's is 'none'; the player's car is drawn translated): where it lands, how wide
  // its opaque body is, and the alpha it was drawn with.
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype, orig = P.drawImage, spans = new WeakMap();
    const span = (img) => {
      let s = spans.get(img);
      if (!s) {
        const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
        let lo = img.width, hi = -1;
        for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x++) {
          if (d[(y * img.width + x) * 4 + 3] > 40) { if (x < lo) lo = x; if (x > hi) hi = x; }
        }
        s = { lo, hi };
        spans.set(img, s);
      }
      return s;
    };
    window.__draws = null;
    P.drawImage = function (img, ...a) {
      if (window.__draws && a.length === 4 && typeof OffscreenCanvas === 'function' && img instanceof OffscreenCanvas && img.thrust === 'none') {
        const m = this.getTransform();
        if (Math.abs(m.e) < 1 && Math.abs(m.f) < 1) {
          const s = span(img), k = a[2] / img.width, vw = this.canvas.width / m.a;
          const l = a[0] + s.lo * k, r = a[0] + s.hi * k;
          window.__draws.push({ body: (r - l) / vw, onCanvas: (Math.min(vw, r) - Math.max(0, l)) / vw, alpha: this.globalAlpha });
        }
      }
      return orig.call(this, img, ...a);
    };
  });
}

/** Hold the first traffic car as a semi `d` units past the camera, just right of your lane,
 *  with everyone else parked far up the road; returns the semi's draws over a few frames. */
const semiAt = (page, d) => page.evaluate((d) => new Promise((done) => {
  const g = window.__OT.GameState, t = window.__OT.traffic();
  const car = t.traffic[0];
  car.style = 'SEMI_TRUCK'; car.shape = 'SEMI_TRUCK'; car.look = null;
  clearInterval(window.__hold);
  window.__hold = setInterval(() => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 45;
    for (const c of t.traffic) if (c !== car) c.worldZ = g.trackPos + 90000;
    for (const c of t.racers) c.worldZ = g.trackPos + 90000;
    if (window.__OT.live && window.__OT.live.ghosts) window.__OT.live.ghosts.length = 0;
    car.takenDown = false; car.worldZ = g.trackPos + d; car.offset = g.playerX + 0.6; car.mph = 45;
  }, 5);
  setTimeout(() => {
    window.__draws = [];
    let n = 4;
    (function tick() { if (n-- > 0) requestAnimationFrame(tick); else { const r = window.__draws; window.__draws = null; done(r); } })();
  }, 300);
}), d);

for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a semi beside the camera is small and see-through, the road stays readable (${size.width}x${size.height})`, async ({ page }, info) => {
    const problems = watchPage(page);
    await page.setViewportSize(size);
    await startRace(page);

    // Far up the road it is an ordinary, solid truck.
    const ahead = await semiAt(page, 2300);
    expect(ahead.length).toBeGreaterThan(0);
    for (const d of ahead) expect(d.alpha).toBe(1);

    // Level with you it has started to fade.
    const level = await semiAt(page, 1250);
    expect(level.length).toBeGreaterThan(0);
    for (const d of level) expect(d.alpha).toBeLessThan(0.9);
    await page.screenshot({ path: info.outputPath(`semi-level-${size.width}x${size.height}.png`) });

    // Passing the camera: at most a quarter of the canvas, and translucent.
    const near = await semiAt(page, 1000);
    expect(near.length).toBeGreaterThan(0);
    for (const d of near) {
      expect(d.body).toBeLessThanOrEqual(0.25);
      expect(d.onCanvas).toBeLessThanOrEqual(0.25);
      expect(d.alpha).toBeLessThanOrEqual(0.4);
    }
    await page.screenshot({ path: info.outputPath(`semi-near-${size.width}x${size.height}.png`) });

    await page.evaluate(() => clearInterval(window.__hold));
    await nextFrames(page, 2);
    expect(problems).toEqual([]);
  });
}
