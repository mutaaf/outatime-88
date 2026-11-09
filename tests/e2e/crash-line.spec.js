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

// Ticket 0254: on a phone the crash line (and any popup with it) never runs under a touch pad.
// The plates are laid out on the road buffer (GameState.hitShockwaves → src/popups.js); this maps
// each drawn plate to the screen at both ends of the FOV crop and checks it against every shown pad.
for (const [w, h] of [[390, 844], [844, 390]]) {
  test.describe(`phone ${w}x${h} (touch)`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('the crash line stays clear of every touch pad', async ({ page }, info) => {
      const problems = watchPage(page);
      await start(page);
      await page.waitForFunction(() => window.__OT.touch && window.__OT.touch() && window.__OT.pickupArt(), null, { timeout: 20000 });
      const gate = await crashInto(page, 'HIGH_LIGHT_GATE', 'touch', '💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!');
      expect(gate.err).toBeUndefined();
      // A score popup at the same moment: both plates share the lane.
      await page.evaluate(() => window.__OT.GameState.hitShockwaves.push({ x: 0, y: 0, radius: 12, maxRadius: 115, color: '#fde047', label: '+1500 ⚡ 1.88GW!', life: 0.9, maxLife: 0.9 }));
      const seen = await page.waitForFunction(() => {
        const s = window.__OT.pickupArt(), list = window.__OT.GameState.hitShockwaves;
        if (!s || !s.labels) return null;
        const plates = [];
        for (let i = 0; i < s.labels; i++) {
          const o = i * 7, e = list[s.slots[o + 5]];
          plates.push({ label: e && e.label, x0: s.slots[o], y0: s.slots[o + 1], x1: s.slots[o] + s.slots[o + 2], y1: s.slots[o + 1] + s.slots[o + 3] });
        }
        if (!plates.some((p) => /BLOCKED/.test(p.label || ''))) return null;
        const pads = [...document.querySelectorAll('#touchControlsLayer .tc-btn, #tcStick, #tcDpad')]
          .filter((e) => !e.classList.contains('tc-hidden') && getComputedStyle(e).display !== 'none')
          .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })
          .filter((r) => r.x1 > r.x0);
        return { plates, pads, rw: s.rw, rh: s.rh, vw: innerWidth, vh: innerHeight };
      }, null, { timeout: 10000 }).then((hnd) => hnd.jsonValue());
      expect(seen.pads.length).toBeGreaterThan(4);
      const hits = [];
      for (const f of [1, 1.115]) {
        const sx = (bx) => (bx - seen.rw * (1 - 1 / f) * 0.5) * f * seen.vw / seen.rw;
        const sy = (by) => (by - seen.rh * (1 - 1 / f) * 0.46) * f * seen.vh / seen.rh;
        for (const p of seen.plates) {
          const q = { x0: sx(p.x0), y0: sy(p.y0), x1: sx(p.x1), y1: sy(p.y1) };
          for (const r of seen.pads) if (q.x0 < r.x1 && r.x0 < q.x1 && q.y0 < r.y1 && r.y0 < q.y1) hits.push(`"${p.label}" over ${r.id} at fov ${f}`);
        }
      }
      await page.screenshot({ path: info.outputPath(`crash-line-pads-${w}x${h}.png`) });
      expect(hits).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}
