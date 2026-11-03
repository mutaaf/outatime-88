// Lane guide (ticket 0219): off by default; on, a car holding your lane makes the guide point to
// the open lane beside you, and the pause card lists it. ?debug never sounds the tone, so the
// test reads GameState.guideSteps / guidePan, which count the steps the race step guided.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait } from './helpers.js';

/** Put the player in road lane `lane` (-0.48 / 0 / 0.48) and hold the first traffic car `side`
 *  road units off your middle, ~0.3 s ahead at 45 mph, with everything else parked far up the road. */
const hold = (page, lane, side) => page.evaluate(([lane, side]) => {
  const g = window.__OT.GameState, t = window.__OT.traffic();
  const car = t.traffic[0];
  clearInterval(window.__hold);
  window.__hold = setInterval(() => {
    g.invulnTimer = 30; g.hp = g.maxHp; g.speed = 45; g.playerX = lane; g.playerVX = 0;
    for (const c of t.traffic) if (c !== car) c.worldZ = g.trackPos + 90000;
    for (const c of t.racers) c.worldZ = g.trackPos + 90000;
    for (const o of t.obstacles) o.worldZ = o.prevZ = g.trackPos + 90000;
    car.idle = false; car.takenDown = false; car.active = true;
    car.worldZ = car.prevZ = g.trackPos + 1250 + 105 + car.halfL + 1500;
    car.offset = car.prevOffset = lane + side; car.mph = 0; car.vz = 0;
  }, 5);
}, [lane, side]);

const guide = (page) => page.evaluate(() => ({ n: window.__OT.GameState.guideSteps || 0, pan: window.__OT.GameState.guidePan }));
const setGuide = async (page) => {
  await page.locator('#btnHudSettings').click();
  await page.locator('#setLaneGuide').click();
  await page.locator('#btnSettingsDone').click();
  await racing(page);
};

test('the lane guide is off by default, then points to the open lane', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);

  await hold(page, -0.48, 0); // left lane, blocked
  await simWait(page, 1);
  expect((await guide(page)).n).toBe(0); // off by default

  await setGuide(page);
  await simWait(page, 1);
  const left = await guide(page);
  expect(left.n).toBeGreaterThan(0);
  expect(left.pan).toBe(1); // the centre lane, to your right

  await hold(page, 0.48, 0); // right lane, blocked
  await simWait(page, 1);
  expect((await guide(page)).pan).toBe(-1);

  // Your own lane clear (the car sits a lane over): no guidance.
  await hold(page, 0, 0.48);
  await simWait(page, 0.5);
  const n0 = (await guide(page)).n;
  await simWait(page, 1);
  expect((await guide(page)).n).toBe(n0);

  // The pause card lists it while it is on.
  await page.locator('#btnHudSettings').click();
  await expect(page.locator('#pauseControls [data-aid="laneGuide"]')).toContainText('LANE GUIDE ON');
  await page.locator('#setLaneGuide').click();
  await expect(page.locator('#pauseControls [data-aid="laneGuide"]')).toHaveCount(0);
  await page.locator('#btnSettingsDone').click();
  await racing(page);

  // Off again: the same blocked lane gets no guidance.
  await hold(page, -0.48, 0);
  await simWait(page, 0.5);
  const off = (await guide(page)).n;
  await simWait(page, 1);
  expect((await guide(page)).n).toBe(off);
  await page.evaluate(() => clearInterval(window.__hold));
  expect(problems).toEqual([]);
});
