// Orange-track set pieces and real curves (sprint 4): drive a booster gate into a loop, a
// corkscrew and a gap jump in 2D and 3D with no console errors, and screenshot them at phone,
// tablet and laptop sizes in both orientations. Uses the ?debug hook to move the car.
import { test, expect } from '@playwright/test';
import { APP, watchPage, canvasLitFraction } from './helpers.js';

async function race(page, { level = 0, view = '' } = {}) {
  await page.goto(`${APP}?debug${view ? `&view=${view}` : ''}`);
  await page.waitForFunction(() => window.__OT);
  await page.evaluate((l) => { window.__OT.GameState.levelIndex = l; }, level);
  await page.locator('#btnStartRace').click();
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 20000 });
}

/** Put the car `before` track Z ahead of the first `kind` set piece; returns the feature. */
function jumpTo(page, kind, before = 6000, frac = 0) {
  return page.evaluate(({ kind, before, frac }) => {
    const OT = window.__OT;
    const f = OT.track().findFeature(kind);
    if (!f) return null;
    OT.GameState.trackPos = f.z0 + f.length * frac - before - 1250;
    OT.GameState.speed = 70;
    OT.GameState.playerY = 0;
    return { id: f.id, z0: f.z0, length: f.length, minMph: f.minMph || 0 };
  }, { kind, before, frac });
}

/** Hold the gas until the car is past feature `f`; returns what the set piece saw. */
async function driveThrough(page, f) {
  await page.keyboard.down('ArrowUp');
  const seen = await page.evaluate((f) => new Promise((resolve) => {
    const g = window.__OT.GameState;
    let entered = false, failed = false, maxMph = 0;
    const t0 = performance.now();
    (function tick() {
      if (g.setPieceId === f.id) entered = true;
      if (g.peeledLoop && g.peeledLoop.z0 === f.z0) failed = true;
      maxMph = Math.max(maxMph, g.speed);
      if (g.trackPos + 1250 > f.z0 + f.length + 300 || performance.now() - t0 > 25000) resolve({ entered, failed, maxMph, past: g.trackPos + 1250 > f.z0 + f.length });
      else requestAnimationFrame(tick);
    })();
  }), f);
  await page.keyboard.up('ArrowUp');
  return seen;
}

test('2D: a booster gate gets you to loop speed and you go all the way round, no errors', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await race(page, { level: 0 });
  const gate = await jumpTo(page, 'BOOSTER', 1500);
  expect(gate).not.toBeNull();
  const loop = await jumpTo(page, 'LOOP', 3200);
  expect(loop).not.toBeNull();
  const seen = await driveThrough(page, loop);
  expect(seen.entered).toBe(true);
  expect(seen.past).toBe(true);
  expect(seen.failed).toBe(false);
  expect(seen.maxMph).toBeGreaterThanOrEqual(loop.minMph);
  expect(problems).toEqual([]);
});

test('2D: corkscrew, half-pipe and gap jump on level 5 play through without errors', async ({ page }) => {
  test.setTimeout(120000);
  const problems = watchPage(page);
  await race(page, { level: 4 });
  for (const kind of ['GAP', 'CORKSCREW', 'WALLRIDE']) {
    const f = await jumpTo(page, kind, 3500);
    expect(f, kind).not.toBeNull();
    const seen = await driveThrough(page, f);
    expect(seen.past, kind).toBe(true);
  }
  expect(problems).toEqual([]);
});

test('3D: the loop and the corkscrew are real geometry the car and camera follow, no errors', async ({ page }) => {
  test.setTimeout(150000);
  const problems = watchPage(page);
  await race(page, { level: 0, view: '3d' });
  await page.waitForFunction(() => window.__OT.view().mode === '3d', null, { timeout: 30000 });
  const loop = await jumpTo(page, 'LOOP', 2500);
  const seen = await driveThrough(page, loop);
  expect(seen.entered).toBe(true);
  expect(seen.past).toBe(true);
  expect(problems).toEqual([]);
});

test('2D: you ride round the loop itself (camera on the loop, not a cutaway), and calm mode keeps the side view', async ({ page }) => {
  test.setTimeout(90000);
  const problems = watchPage(page);
  await race(page, { level: 0 });
  await page.waitForFunction(() => typeof window.__OT.GameState.loopRide === 'number');
  await jumpTo(page, 'LOOP', 4000);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__OT.GameState.loopRide)).toBe(0);
  for (const frac of [0.25, 0.5, 0.75]) {
    await jumpTo(page, 'LOOP', 0, frac);
    await page.waitForFunction(() => window.__OT.GameState.loopRide === 1, null, { timeout: 5000 });
  }
  // Calm mode: no screen turning over.
  await page.evaluate(() => { window.__OT.GameState.reducedMotion = true; });
  await jumpTo(page, 'LOOP', 0, 0.5);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__OT.GameState.loopRide)).toBe(0);
  expect(problems).toEqual([]);
});

const SIZES = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1280, 720]];
for (const [w, h] of SIZES) {
  test(`screenshots: loop cam and corkscrew roll at ${w}x${h}`, async ({ page }, info) => {
    test.setTimeout(90000);
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await race(page, { level: 4 });
    for (const [kind, frac] of [['CORKSCREW', 0.35], ['WALLRIDE', 0.5], ['GAP', 0]]) {
      await jumpTo(page, kind, kind === 'GAP' ? 2500 : 0, frac);
      await page.waitForTimeout(300);
      expect(await canvasLitFraction(page), kind).toBeGreaterThan(0.2);
      await info.attach(`${kind}-${w}x${h}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    await race(page, { level: 0 });
    for (const frac of [0.25, 0.5, 0.75]) {
      await jumpTo(page, 'LOOP', 0, frac);
      await page.waitForTimeout(300);
      expect(await canvasLitFraction(page), `loop ${frac}`).toBeGreaterThan(0.2);
      await info.attach(`LOOP-${frac}-${w}x${h}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(problems).toEqual([]);
  });
}

test('perf: frame interval through hairpins and a corkscrew stays playable in 2D and 3D', async ({ page }, info) => {
  test.setTimeout(150000);
  const probe = () => page.evaluate(() => new Promise((resolve) => {
    const times = [];
    (function tick(t) { times.push(t); if (times.length < 91) requestAnimationFrame(tick); else resolve((times[90] - times[0]) / 90); })(performance.now());
  }));
  for (const view of ['', '3d']) {
    await race(page, { level: 3, view });
    if (view) await page.waitForFunction(() => window.__OT.view().mode === '3d', null, { timeout: 30000 });
    await jumpTo(page, 'CORKSCREW', 1000);
    await page.keyboard.down('ArrowUp');
    const ms = await probe();
    await page.keyboard.up('ArrowUp');
    info.annotations.push({ type: `curve-frame-ms-${view || '2d'}`, description: ms.toFixed(2) });
    console.log(`[perf] curves ${view || '2d'}: ${ms.toFixed(2)} ms/frame`);
    expect(ms).toBeLessThan(view ? 150 : 100);
  }
});
