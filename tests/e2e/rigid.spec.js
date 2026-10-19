// Rigid-body world v2 (ticket 0176) in a real race: a semi drifting into a sedan shoves it
// across the road and barely notices; a knocked-out car tumbles, lands and settles.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

async function race(page) {
  await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ onboarded: true, initials: 'TST' })));
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.traffic().traffic.length >= 2, null, { timeout: 15000 });
}

test('a semi drifting into a sedan shoves it aside; momentum goes the right way', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  const r = await page.evaluate(async () => {
    const T = window.__OT.traffic();
    const G = window.__OT.GameState;
    const semi = T.traffic.find((t) => t.style === 'SEMI_TRUCK');
    const car = T.traffic.find((t) => t.style !== 'SEMI_TRUCK');
    // Side by side well ahead of you, same speed, the semi drifting right into the sedan.
    const z = (G.visualPlayerZ || G.trackPos + 1250) + 6000;
    for (const [b, off] of [[semi, -0.2], [car, 0.115]]) {
      b.worldZ = z; b.prevZ = z; b.offset = off; b.prevOffset = off; b.yaw = 0; b.vYaw = 0;
      b.vz = semi.driveVz || 3000; b.stun = 0; b.takenDown = false; b.avoidZ = 0; b.blockedT = 0;
    }
    T.planner.trafficTarget = (zz, off) => off; // hold their lanes: only physics moves them sideways
    semi.vx = 1.2;
    window.__OT.GameState.speed = 0;
    const before = { semi: semi.offset, car: car.offset };
    // Watch every physics step (a slow machine runs several per frame).
    let carVx = 0, semiVx = 9;
    const W = T.world, step = W.step;
    W.step = function (...a) { const st = step.apply(this, a); if (car.vx > carVx) { carVx = car.vx; semiVx = semi.vx; } return st; };
    for (let i = 0; i < 40; i++) await new Promise((res) => requestAnimationFrame(res));
    W.step = step;
    return { before, car: car.offset, semi: semi.offset, carVx, semiVx, carStun: car.stun };
  });
  expect(r.carVx).toBeGreaterThan(0.3);     // the sedan was thrown right
  expect(r.car).toBeGreaterThan(r.before.car + 0.05);
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
    const tick = () => { if (!window.__wreck) return; window.__wreckMax = Math.max(window.__wreckMax, Math.abs(car.rot)); requestAnimationFrame(tick); };
    tick();
  });
  await page.waitForFunction(() => {
    const c = window.__wreck;
    const rest = Math.abs(c.rot % (Math.PI * 2));
    return window.__wreckMax > 1.5 && c.y === 0 && Math.abs(c.vRot) < 0.5 && Math.min(rest, Math.PI * 2 - rest) < 0.2;
  }, null, { timeout: 12000 });
  expect(problems).toEqual([]);
});
