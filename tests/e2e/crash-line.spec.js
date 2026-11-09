// Ticket 0253: the obstacle crash line names the control for the input in hand. On a phone a
// high gate says "HOLD DRIFT TO SLIDE UNDER!" (the DRIFT pad), never the keyboard's "(S)"; a
// keyboard keeps today's words. The test parks one obstacle just ahead in your lane and reads
// the label the crash pushed (GameState.hitShockwaves), then screenshots the plate.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Drive into a `type` obstacle held just ahead in your lane until the crash pushes `label`
 *  (GameState.hitShockwaves). Every other obstacle, car and racer is parked far up the road, so
 *  only this one can be hit; the deadline is race time, not wall clock. Resolves { label } or { err }. */
async function crashInto(page, type, input, label) {
  return page.evaluate(([type, input, label]) => new Promise((done) => {
    const { GameState: g, InputState: inp } = window.__OT, t = window.__OT.traffic();
    const ob = t.obstacles.find((o) => o.type === type);
    if (!ob) { done({ err: `no ${type}` }); return; }
    const t0 = g.raceTime;
    const away = (o) => { o.worldZ = g.trackPos + 90000; if (o.prevZ !== undefined) o.prevZ = o.worldZ; };
    const finish = (r) => { clearInterval(iv); away(ob); done(r); };
    const hold = () => {
      inp.lastInput = input; inp.down = false; inp.touchDown = false;
      g.invulnTimer = 0; g.shieldTimer = 0; g.hp = g.maxHp; g.speed = Math.max(g.speed, 60);
      for (const o of t.obstacles) if (o !== ob) away(o);
      for (const c of t.traffic) c.worldZ = g.trackPos + 90000;
      for (const c of t.racers) c.worldZ = g.trackPos + 90000;
      const seen = g.hitShockwaves.map((s) => s.label || '');
      if (seen.includes(label)) { finish({ label }); return; }
      const other = seen.find((l) => /BLOCKED/.test(l));
      if (other) { finish({ label: other }); return; } // wrong words: let the assertion show them
      if (g.status !== 'PLAYING' || g.raceTime - t0 > 10) { finish({ err: `no crash in ${(g.raceTime - t0).toFixed(1)} s of race (${g.status}): ${seen.join(' | ')}` }); return; }
      if (ob.worldZ < g.trackPos + 1250 - 200 || ob.worldZ > g.trackPos + 1250 + 900) { ob.worldZ = g.trackPos + 1250 + 500; ob.offset = g.playerX; ob.y = 0; }
    };
    const iv = setInterval(hold, 5);
    hold();
  }), [type, input, label]);
}

async function start(page) {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // Make sure each kind exists on the road (the generator may not have placed one yet).
  await page.evaluate(() => {
    const t = window.__OT.traffic(), g = window.__OT.GameState;
    for (const type of ['HIGH_LIGHT_GATE', 'LOW_LASER_BAR']) {
      if (!t.obstacles.some((o) => o.type === type)) t.obstacles.push(t.createObstacleBody(t.obstacles.length, type, g.trackPos + 60000, 0));
    }
  });
}

test.describe('phone (touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a high gate names the DRIFT pad, a low bar the JUMP pad, no key letters', async ({ page }, info) => {
    const problems = watchPage(page);
    await start(page);
    const gate = await crashInto(page, 'HIGH_LIGHT_GATE', 'touch', '💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!');
    expect(gate.err).toBeUndefined();
    expect(gate.label).toBe('💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!');
    await page.screenshot({ path: info.outputPath('crash-line-390.png') });
    await page.evaluate(() => { window.__OT.GameState.hitShockwaves.length = 0; });
    const bar = await crashInto(page, 'LOW_LASER_BAR', 'touch', '💥 BLOCKED! HIT JUMP OR STEER AROUND!');
    expect(bar.err).toBeUndefined();
    expect(bar.label).toBe('💥 BLOCKED! HIT JUMP OR STEER AROUND!');
    for (const l of [gate.label, bar.label]) expect(l).not.toMatch(/\([A-Z/]+\)/);
    expect(problems).toEqual([]);
  });
});

test.describe('desktop (keyboard)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('keyboard keeps its words; a pad names its buttons', async ({ page }, info) => {
    const problems = watchPage(page);
    await start(page);
    const gate = await crashInto(page, 'HIGH_LIGHT_GATE', 'keys', '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!');
    expect(gate.err).toBeUndefined();
    expect(gate.label).toBe('💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!');
    await page.screenshot({ path: info.outputPath('crash-line-1280.png') });
    await page.evaluate(() => { window.__OT.GameState.hitShockwaves.length = 0; });
    const bar = await crashInto(page, 'LOW_LASER_BAR', 'pad', '💥 BLOCKED! JUMP (Y) OR STEER AROUND!');
    expect(bar.err).toBeUndefined();
    expect(bar.label).toBe('💥 BLOCKED! JUMP (Y) OR STEER AROUND!');
    expect(problems).toEqual([]);
  });
});
