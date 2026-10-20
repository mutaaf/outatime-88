// Pickups (src/pickups.js + the lazy src/pickup-art.js): drive a coin trail on the clean line
// and collect every coin through the one collection path, then check the crisp icon cache is
// in use at 2× device pixels. Uses the ?debug hook to place the car.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';
import { ENDLESS } from '../../src/endless.js';

async function race(page) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START', null, { timeout: 30000 });
}

/** The next coin trail ahead of the car: its four segments' coins (index + offset). */
function nextTrail(page) {
  return page.evaluate(() => {
    const OT = window.__OT, tr = OT.track(), g = OT.GameState;
    const from = Math.floor((g.trackPos + 1250) / 200) + 30;
    for (let i = from; i < tr.end - 12; i++) {
      const coins = [];
      for (let d = 0; d <= 9; d += 3) {
        const s = tr.seg(i + d);
        const it = s && s.items.find((x) => x.type === 'HW_COIN' && !x.collected);
        if (it) coins.push({ i: i + d, offset: it.offset });
      }
      if (coins.length === 4) return coins;
    }
    return null;
  });
}

test('2D: driving the clean line collects a whole coin trail (score, coins, combo)', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await race(page);
  const trail = await nextTrail(page);
  expect(trail).not.toBeNull();
  const before = await page.evaluate(() => ({ n: window.__OT.GameState.pickupsTaken || 0, coins: window.__OT.GameState.runCoins, score: window.__OT.GameState.score }));
  // Put the car just before the trail and steer it along the coins every frame.
  const after = await page.evaluate((trail) => new Promise((resolve) => {
    const OT = window.__OT, g = OT.GameState, tr = OT.track();
    g.trackPos = trail[0].i * 200 - 1250 - 1400;
    g.speed = 60;
    const t0 = performance.now();
    (function tick() {
      const cur = Math.floor((g.trackPos + 1250) / 200);
      const next = trail.find((c) => c.i >= cur) || trail[trail.length - 1];
      g.playerX = next.offset; g.playerVX = 0;
      const done = trail.every((c) => tr.seg(c.i).items.some((x) => x.type === 'HW_COIN' && x.collected));
      if (done || performance.now() - t0 > 20000) resolve({ done, n: g.pickupsTaken || 0, coins: g.runCoins, score: g.score });
      else requestAnimationFrame(tick);
    })();
  }), trail);
  expect(after.done).toBe(true);
  expect(after.n - before.n).toBeGreaterThanOrEqual(4);
  // Four 4-coin pickups; Endless (the title's mode) pays its share of that (docs/BALANCE.md).
  expect(after.coins - before.coins).toBeGreaterThanOrEqual(Math.floor(16 * ENDLESS.cash));
  expect(after.score).toBeGreaterThan(before.score);
  expect(problems).toEqual([]);
});

test('2D at 2× device pixels: pickups come from the crisp icon cache', async ({ browser }, info) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const problems = watchPage(page);
  await race(page);
  const trail = await nextTrail(page);
  expect(trail).not.toBeNull();
  await page.evaluate((trail) => { const g = window.__OT.GameState; g.trackPos = trail[0].i * 200 - 1250 - 2600; g.playerX = trail[0].offset; g.speed = 20; }, trail);
  await page.waitForFunction(() => { const s = window.__OT.pickupArt(); return s && s.built > 0 && s.icons > 0; }, null, { timeout: 15000 });
  await page.evaluate(() => window.__OT.pause());
  await page.waitForTimeout(150);
  await info.attach('pickups-2x', { body: await page.screenshot(), contentType: 'image/png' });
  expect(problems).toEqual([]);
  await ctx.close();
});

// Ticket 0114: pickup labels hang above the car on a dark plate, never on it, never on each
// other, never cut off by the canvas edge. Reads the layout the lazy pickup art just drew.
for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`labels at ${w}x${h}: above the car, apart, on screen`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await race(page);
    await page.waitForFunction(() => window.__OT.pickupArt());
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const OT = window.__OT;
      OT.pickup('REPAIR_WRENCH');
      setTimeout(() => OT.pickup('HW_COIN'), 150);
      setTimeout(() => OT.pickup('NOS_CAN'), 280);
      const t0 = performance.now();
      let best = null;
      (function tick() {
        const s = OT.pickupArt();
        if (s.labels > (best ? best.rects.length : 0)) {
          const rects = [];
          for (let i = 0; i < s.labels; i++) { const o = i * 7; rects.push([s.slots[o], s.slots[o + 1], s.slots[o] + s.slots[o + 2], s.slots[o + 1] + s.slots[o + 3]]); }
          best = { rects, box: { ...s.box }, rw: s.rw, rh: s.rh };
        }
        if ((best && best.rects.length >= 3) || performance.now() - t0 > 8000) { OT.pause(); resolve(best); } else requestAnimationFrame(tick);
      })();
    }));
    expect(seen).not.toBeNull();
    expect(seen.rects.length).toBeGreaterThanOrEqual(2);
    const { box, rw, rh } = seen;
    expect(box.y1).toBeGreaterThan(box.y0);
    const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    for (const r of seen.rects) {
      expect(hit(r, [box.x0, box.y0, box.x1, box.y1])).toBe(false);
      expect(r[0] >= 0 && r[1] >= 0 && r[2] <= rw && r[3] <= rh).toBe(true);
    }
    for (let i = 0; i < seen.rects.length; i++) for (let j = i + 1; j < seen.rects.length; j++) expect(hit(seen.rects[i], seen.rects[j])).toBe(false);
    await info.attach(`labels-${w}x${h}`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
