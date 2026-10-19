// Rigid-body world v2 (ticket 0176) in a real race: a semi drifting into a sedan shoves it
// across the road and barely notices; a knocked-out car tumbles, lands and settles.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

async function race(page) {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, initials: 'TST' })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  // Past the lights and stepping, with the rigid world made (it's created on the first step).
  await racing(page);
  await page.waitForFunction(() => window.__OT.traffic().traffic.length >= 2 && window.__OT.traffic().world);
}

test('a semi drifting into a sedan shoves it aside; momentum goes the right way', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  // Set the pair up and count physics steps from inside the world, so the result depends on
  // simulated time (120 steps = 1 s), never on how many frames a slow runner manages.
  const setup = (zAhead) => page.evaluate((zAhead) => {
    const T = window.__OT.traffic();
    const G = window.__OT.GameState;
    const semi = T.traffic.find((t) => t.style === 'SEMI_TRUCK');
    const car = T.traffic.find((t) => t.style !== 'SEMI_TRUCK');
    // Side by side ahead of you, same speed, the semi drifting right into the sedan.
    const z = (G.visualPlayerZ || G.trackPos + 1250) + zAhead;
    for (const [b, off] of [[semi, -0.2], [car, 0.115]]) {
      b.worldZ = z; b.prevZ = z; b.offset = off; b.prevOffset = off; b.yaw = 0; b.vYaw = 0;
      b.vz = semi.driveVz || 3000; b.stun = 0; b.takenDown = false; b.avoidZ = 0; b.blockedT = 0;
    }
    T.planner.trafficTarget = (zz, off) => off; // hold their lanes: only physics moves them sideways
    semi.vx = 1.2;
    G.speed = 0;
    const w = window.__shove = { steps: 0, carVx: 0, semiVx: 0, z, before: car.offset, car: car.offset, moved: false };
    const W = T.world;
    if (!W.__step) W.__step = W.step;
    W.step = function (...a) {
      const st = W.__step.apply(this, a);
      w.steps++;
      if (car.vx > w.carVx) { w.carVx = car.vx; w.semiVx = semi.vx; }
      w.car = Math.max(w.car, car.offset); // furthest it was thrown (drivers may steer back later)
      // A set piece under them recycles traffic elsewhere: that try doesn't count.
      if (Math.abs(car.worldZ - w.z) > 3000 || Math.abs(semi.worldZ - w.z) > 3000) w.moved = true;
      return st;
    };
  }, zAhead);
  let r = null;
  for (const zAhead of [6000, 9000, 12000, 15000]) {
    await setup(zAhead);
    await page.waitForFunction(() => window.__shove.steps >= 90 || window.__shove.moved);
    r = await page.evaluate(() => window.__shove);
    if (!r.moved) break;
  }
  await page.evaluate(() => { const W = window.__OT.traffic().world; W.step = W.__step; });
  expect(r.moved).toBe(false);
  expect(r.carVx).toBeGreaterThan(0.3);     // the sedan was thrown right
  expect(r.car).toBeGreaterThan(r.before + 0.05);
  expect(r.semiVx).toBeGreaterThan(0.3);     // the semi kept most of its drift
  expect(problems).toEqual([]);
});

test('a knocked-out car tumbles, lands and settles on its wheels', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  await page.evaluate(() => {
    const T = window.__OT.traffic();
    const G = window.__OT.GameState;
    const car = T.racers[0]; // a rival: it stays wrecked until it respawns
    const z = (G.visualPlayerZ || G.trackPos + 1250) + 5000;
    car.worldZ = z; car.prevZ = z; car.offset = -0.3; car.yaw = 0; car.rot = 0;
    car.takenDown = true; car.respawnTimer = 30;
    car.vy = 520; car.vRot = 9; car.vYaw = 3;
    window.__wreck = car;
    window.__wreckMax = 0;
    // Track the tumble every physics step, not every frame (a starved runner skips frames).
    const W = T.world, step = W.step;
    W.step = function (...a) { const st = step.apply(this, a); window.__wreckMax = Math.max(window.__wreckMax, Math.abs(car.rot)); return st; };
  });
  await page.waitForFunction(() => {
    const c = window.__wreck;
    const rest = Math.abs(c.rot % (Math.PI * 2));
    return window.__wreckMax > 1.5 && c.y === 0 && Math.abs(c.vRot) < 0.5 && Math.min(rest, Math.PI * 2 - rest) < 0.2;
  }, null, { timeout: 12000 });
  expect(problems).toEqual([]);
});
