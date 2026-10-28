// Arrival stretch (ticket 0218): the first warp of a solo run lands on an authored 1985 stretch
// (a gentle sweeper into a straight lined with signs), clear of obstacles, with the player
// driving the whole way. Seeded races (dailies, live rooms) never get one.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const SEG = 200, CAM = 1250; // ROAD_CFG.segLength, ROAD_CFG.playerZOffset (src/data.js)
const STRETCH = 138; // segments in ARRIVALS[1985] (src/arrival.js)

/** Force one warp (re-armed on every poll: a bump can drain the meter before the check runs). */
async function warp(page) {
  const before = await page.evaluate(() => window.__OT.GameState.timeWarps);
  await page.waitForFunction((b) => {
    const g = window.__OT.GameState;
    if (g.timeWarps > b) return true;
    g.fluxCharge = 100; g.speed = 100; g.sinceWarp = 99; g.warpActiveTimer = 0;
    return false;
  }, before, { timeout: 5000 });
}

test('the first warp of a run lands on the 1985 stretch: clear lanes, the player in control', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  expect(await page.evaluate(() => window.__OT.GameState.eraIndex)).toBe(0); // level 1 starts in 2026
  await warp(page);
  await expect(page.locator('#eraBadge')).toContainText('1985');
  expect(await page.evaluate(() => window.__OT.track().run.arrival)).toBe('1985');

  // Move up to the end of the built road: the next road the race builds is the stretch.
  const at = await page.evaluate(([SEG, CAM]) => {
    const t = window.__OT.track();
    window.__OT.sim(1, () => { window.__OT.GameState.trackPos = (t.end - 200) * SEG - CAM; });
    return t.run.arrivalAt;
  }, [SEG, CAM]);
  expect(at.era).toBe('1985');
  expect(at.z1 - at.z0).toBe(STRETCH * SEG);

  // Drive it, holding left part of the way: the car steers, nothing on the road, race on.
  await page.keyboard.down('ArrowLeft');
  const drive = await page.evaluate(([at, CAM]) => {
    const O = window.__OT, g = O.GameState, t = O.track();
    const out = { steps: 0, inStretch: 0, blocked: [], status: new Set(), x0: 0, x1: 0 };
    O.sim(1, () => { g.trackPos = at.z0 - CAM + 400; g.playerX = 0; });
    out.x0 = g.playerX;
    for (let n = 0; n < 2400; n++) {
      if (n === 60) O.input.left = false; // the key goes up mid-stretch: lateral control both ways
      O.sim(1, () => { g.speed = 88; g.hp = g.maxHp; g.invulnTimer = 1; g.fluxCharge = 0; });
      const z = g.trackPos + CAM;
      if (z >= at.z1) break;
      out.steps++;
      if (n === 59) out.x1 = g.playerX;
      out.status.add(g.status);
      const seg = t.seg(Math.floor(z / 200));
      if (seg && seg.feature && seg.feature.kind === 'ARRIVAL') out.inStretch++;
      const tr = O.traffic();
      for (const b of [...tr.obstacles, ...tr.props.live]) {
        if (b.worldZ >= at.z0 && b.worldZ <= at.z1 && Math.abs(b.offset) < 1) out.blocked.push(`${b.kind}@${Math.round(b.worldZ)}`);
      }
    }
    return { ...out, status: [...out.status] };
  }, [at, CAM]);
  await page.keyboard.up('ArrowLeft');
  expect(drive.status).toEqual(['PLAYING']);
  expect(drive.inStretch).toBe(drive.steps);
  expect(drive.steps).toBeGreaterThan(300);
  expect(drive.x1).toBeLessThan(drive.x0 - 0.05); // the player steered while in the stretch
  expect([...new Set(drive.blocked)]).toEqual([]);

  // A second warp gets no second stretch.
  await page.evaluate(() => window.__OT.release());
  await nextFrames(page, 3);
  await warp(page);
  expect(await page.evaluate(() => window.__OT.track().run.arrival)).toBeFalsy();
  expect(problems).toEqual([]);
});

test('a daily never gets an arrival stretch (everyone races the same road)', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ daily: true }));
  await racing(page);
  await page.evaluate(() => { window.__OT.GameState.eraIndex = 0; }); // so the warp lands in 1985
  await warp(page);
  await expect(page.locator('#eraBadge')).toContainText('1985');
  expect(await page.evaluate(() => window.__OT.track().run.arrival)).toBeFalsy();
  expect(await page.evaluate(() => window.__OT.track().run.arrivalDone)).toBeFalsy();
  expect(problems).toEqual([]);
});
