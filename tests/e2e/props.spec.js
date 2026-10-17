// Per-object physics (ticket 0074): a cone in your path is swatted aside by a real
// momentum exchange, tumbles, lands and goes to sleep; it costs a small penalty, not HP.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('hitting a cone knocks it flying, costs a cone penalty and no HP; it settles and sleeps', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__OT.GameState.speed > 40, null, { timeout: 15000 });
  const before = await page.evaluate(() => {
    const T = window.__OT.traffic();
    const G = window.__OT.GameState;
    const playerZ = G.visualPlayerZ || G.trackPos + 1250;
    const cone = T.props.spawn(T.obstacleOpts(999, 'TRAFFIC_CONE', playerZ + 900, G.playerX));
    T.rebuildBodyLists();
    window.__cone = cone;
    return { hp: G.hp, speed: G.speed };
  });
  await page.waitForFunction(() => window.__cone.hitCount > 0, null, { timeout: 8000 });
  const flying = await page.evaluate(() => ({ vz: window.__cone.vz, y: window.__cone.y, vy: window.__cone.vy, cones: window.__OT.GameState.penaltyLog.cone.length, hp: window.__OT.GameState.hp, speed: window.__OT.GameState.speed }));
  expect(flying.cones).toBe(1);
  expect(flying.vz).toBeGreaterThan(0);
  expect(flying.y > 0 || flying.vy > 0).toBe(true);
  expect(flying.hp).toBe(before.hp);
  await expect(page.locator('#hudPenalty')).toContainText('CONE HIT');
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => window.__cone.sleeping || !window.__cone.active, null, { timeout: 12000 });
  expect(problems).toEqual([]);
});

test('props stay pooled: a long race never grows past the pool', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(9000);
  await page.keyboard.up('ArrowUp');
  const r = await page.evaluate(() => {
    const T = window.__OT.traffic();
    return { pool: T.props.items.length, live: T.props.live.length, bodies: T.bodies.length, stats: { ...T.world.stats } };
  });
  expect(r.pool).toBe(24);
  expect(r.live).toBeLessThanOrEqual(24);
  expect(r.bodies).toBe(r.stats.bodies);
  expect(problems).toEqual([]);
});
