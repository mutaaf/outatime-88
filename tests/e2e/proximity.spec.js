// Proximity cue (ticket 0191): a car about to hit you ticks from its side, a few times a second
// at most, and Settings → Sound → Proximity cue turns it off. ?debug never sounds the tick, so the
// test reads GameState.proxTicks / proxPan, which count the ticks the race step chose to play.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait } from './helpers.js';

/** Hold the first traffic car `side` road units off your middle, ~0.3 s ahead of your bumper
 *  at 45 mph, with everything else parked far up the road. */
const holdCar = (page, side) => page.evaluate((side) => {
  const g = window.__OT.GameState, t = window.__OT.traffic();
  const car = t.traffic[0];
  clearInterval(window.__hold);
  window.__hold = setInterval(() => {
    g.invulnTimer = 30; g.hp = g.maxHp; g.speed = 45;
    for (const c of t.traffic) if (c !== car) c.worldZ = g.trackPos + 90000;
    for (const c of t.racers) c.worldZ = g.trackPos + 90000;
    car.idle = false; car.takenDown = false; car.active = true;
    car.worldZ = car.prevZ = g.trackPos + 1250 + 105 + car.halfL + 1500;
    car.offset = car.prevOffset = g.playerX + side; car.mph = 0; car.vz = 0;
  }, 5);
}, side);

const ticks = (page) => page.evaluate(() => ({ n: window.__OT.GameState.proxTicks || 0, pan: window.__OT.GameState.proxPan }));

test('traffic about to hit you ticks from its side, and the setting turns it off', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);

  await holdCar(page, 0);
  await simWait(page, 1);
  const centre = await ticks(page);
  expect(centre.n).toBeGreaterThan(0);
  expect(centre.pan).toBe(0);

  await holdCar(page, -0.15);
  const t0 = await page.evaluate(() => window.__OT.GameState.raceTime);
  const n0 = (await ticks(page)).n;
  await simWait(page, 2);
  const left = await ticks(page);
  const dt = (await page.evaluate(() => window.__OT.GameState.raceTime)) - t0;
  expect(left.pan).toBe(-1);
  expect(left.n - n0).toBeLessThanOrEqual(Math.ceil(dt * 4) + 1); // rate-limited, ~4 a second

  // Off in Settings → Sound: no more ticks while the same car keeps coming.
  await page.locator('#btnHudSettings').click();
  await page.locator('#setProximity').click();
  await expect(page.locator('#setProximity')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#btnSettingsDone').click();
  await racing(page);
  const off = (await ticks(page)).n;
  await simWait(page, 1);
  expect((await ticks(page)).n).toBe(off);
  await page.evaluate(() => clearInterval(window.__hold));
  expect(problems).toEqual([]);
});
