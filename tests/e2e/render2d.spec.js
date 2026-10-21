// The 2D race frame after the renderer moved to src/render/ (ticket 0015). The race is frozen
// (sim held, graphics governor held, clock and randomness pinned, traffic parked up the road)
// and the frame is redrawn on demand: it must come out the same every time, with the era's sky
// on top, the orange deck under the car and the car itself, at desktop and phone size.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Freezes the race at a fixed spot and returns `frames` redraws of it, sampled. */
const frozenFrames = (page, frames) => page.evaluate((frames) => {
  const O = window.__OT, g = O.GameState, t = O.traffic();
  O.sim(1); // holds the frame loop: from here on only a resize redraws (main.js)
  Date.now = () => 1.7e12; Math.random = () => 0.5;
  Object.assign(g, {
    trackPos: 2400, playerX: 0, playerY: 0, playerVX: 0, speed: 0, screenShake: 0, invulnTimer: 0, warpFxTimer: 0,
    nosBurning: false, carSurgeTimer: 0, agroTimer: 0, carYaw: 0, cameraBank: 0, stuntSpinAngle: 0, chassisRoll: 0,
    chassisPitch: 0, suspOffset: 0, carJoltY: 0,
  });
  for (const k of ['particles', 'flyingWrecks', 'pickupAnimations', 'hitShockwaves', 'debrisShards', 'lightningBolts']) g[k].length = 0;
  for (const c of [...t.traffic, ...t.racers]) c.worldZ = g.trackPos + 90000;
  const c = document.getElementById('gameCanvas'), ctx = c.getContext('2d');
  const out = [];
  for (let f = 0; f < frames; f++) {
    window.dispatchEvent(new Event('resize'));
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4 * 53) px.push(d[i], d[i + 1], d[i + 2]);
    const at = (fx, fy) => { const o = (Math.floor(fy * c.height) * c.width + Math.floor(fx * c.width)) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    out.push({ px, w: c.width, h: c.height, sky: at(0.5, 0.05), deck: at(0.5, 0.97), car: g.carBox && { ...g.carBox } });
  }
  return out;
}, frames);

const same = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 24) n++;
  return n / (a.length / 3);
};

for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`the carved 2D renderer draws a whole, repeatable frame at ${w}x${h} (0015)`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${APP}?debug`);
    await page.waitForFunction(() => window.__OT && window.__OT.gfx && window.__OT.gfx());
    await page.evaluate(() => { window.__OT.gfx().sample = () => false; }); // no resolution steps mid-test
    await page.locator('#btnStartRace').click();
    await racing(page);
    // The lazy 2D art (car sprites, pickups, set pieces) lands shortly after boot.
    await page.waitForFunction(() => window.__OT.GameState.playerShape2D, null, { timeout: 15000 });
    const [a, b, c] = await frozenFrames(page, 3);
    expect(a.w).toBeGreaterThan(0);
    expect(same(a.px, b.px)).toBeGreaterThanOrEqual(0.999);
    expect(same(a.px, c.px)).toBeGreaterThanOrEqual(0.999);
    // The sky is the era's (not the cleared canvas), the deck under the car is the warm toy track.
    expect(a.sky[0] + a.sky[1] + a.sky[2]).toBeGreaterThan(20);
    expect(a.deck[0]).toBeGreaterThan(a.deck[2]);
    // The player car was drawn and published its screen box, centred on the road.
    expect(a.car.x1 - a.car.x0).toBeGreaterThan(20);
    expect(a.car.x0).toBeGreaterThan(0);
    expect(a.car.x1).toBeLessThan(w);
    expect(problems).toEqual([]);
  });
}
