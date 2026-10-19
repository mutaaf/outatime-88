// Organic keyboard steering (ticket 0120): keys ramp the wheel in and out, so a tap nudges,
// a hold builds to full lock, and the car's sideways motion never jumps.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

async function race(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START');
  // Hold 80 mph on the centre line and record the sim's own state every 10 ms.
  await page.evaluate(() => {
    const g = window.__OT.GameState;
    g.playerX = 0; g.playerVX = 0;
    window.__trace = [];
    window.__rec = setInterval(() => { g.speed = 80; g.playerY = 0; window.__trace.push([g.raceTime, g.steerInput, g.playerVX, g.playerX]); }, 10);
  });
}
const take = (page) => page.evaluate(() => { const t = window.__trace; window.__trace = []; return t; });

test('a tap nudges, a hold ramps to full lock, and sideways motion has no jumps', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await take(page);
  // A 50 ms tap in simulation time (wall-clock key timing is too jittery on loaded CI).
  // On a loaded runner the page can only check the clock every few sim steps, so the key may
  // stay down a little longer than 50 ms of sim time: judge the peak against how long it was
  // actually held (a small first step, then the wheel ramps at ~4.2 lock/s), and wait for the
  // return to centre in sim time too.
  // The 10 ms recorder can miss a 50 ms tap entirely on a starved runner, so the tap watches
  // the wheel itself too (every 1 ms while held, every 5 ms on the way back).
  const { held, peak } = await page.evaluate(() => new Promise((done) => {
    const g = window.__OT.GameState, inp = window.__OT.InputState, t0 = g.raceTime;
    let peak = 0;
    inp.right = true;
    const id = setInterval(() => {
      peak = Math.max(peak, g.steerInput);
      if (g.raceTime - t0 < 0.05) return;
      inp.right = false; clearInterval(id);
      const held = g.raceTime - t0, t1 = g.raceTime;
      const back = setInterval(() => {
        peak = Math.max(peak, g.steerInput);
        if (g.raceTime - t1 >= 0.5) { clearInterval(back); done({ held, peak }); }
      }, 5);
    }, 1);
  }));
  const tap = await take(page);
  const tapPeak = Math.max(peak, ...tap.map((r) => r[1]));
  expect(tapPeak).toBeGreaterThan(0.05);
  expect(tapPeak).toBeLessThan(0.15 + 4.2 * held + 0.05); // first step + the ramp, never a jump to lock
  if (held < 0.1) expect(tapPeak).toBeLessThan(0.6); // a real tap is never full lock
  expect(tap[tap.length - 1][1]).toBe(0); // and the wheel comes back to centre

  const tHold = await page.evaluate(() => window.__OT.GameState.raceTime);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction((t) => window.__OT.GameState.raceTime - t >= 0.6, tHold); // 0.6 s of sim time
  const hold = await take(page);
  await page.keyboard.up('ArrowLeft');
  const steer = hold.map((r) => r[1]);
  expect(Math.min(...steer)).toBeLessThan(-0.55); // full lock at 80 mph is ~0.7
  expect(steer[0]).toBeGreaterThan(-0.5); // …built up, not instant
  const lockAt = steer.findIndex((v) => v < -0.55);
  for (let i = 1; i <= lockAt; i++) expect(steer[i]).toBeLessThanOrEqual(steer[i - 1] + 1e-9); // the ramp only ever builds

  // Bounded lateral acceleration (simulation time): steering alone never teleports the car.
  // Bumps from traffic are real impulses, so judge the 90th percentile, not the worst sample.
  const all = tap.concat(hold);
  const acc = [];
  for (let i = 1; i < all.length; i++) {
    const dt = all[i][0] - all[i - 1][0];
    if (dt > 0) acc.push(Math.abs(all[i][2] - all[i - 1][2]) / dt);
  }
  acc.sort((a, b) => a - b);
  expect(acc[Math.floor(acc.length * 0.9)]).toBeLessThan(14);
  expect(problems).toEqual([]);
});
