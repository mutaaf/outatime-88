// Boards never hide what you race (ticket 0203): the 2D road draws far to near, so a board on a
// nearer segment used to paint straight over a rival further up the road. Now a board whose face
// covers a car drawn behind it draws see-through, and the car still shows through its pixels.
// Render-only: the test holds the camera and one traffic car in place; the sim is untouched.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

/** Hold the camera before each loop banner and overhead board on the (seeded) road, with every
 *  car parked in the lanes up the road behind it, until a board reports that it faded for one of
 *  them. Loop banners stand at the booster gate where the road climbs into a loop, so the cars on
 *  the climb sit behind the banner on screen. Pickups are cleared, so it is a car (or a road
 *  obstacle). Returns { alpha, kind, P0, P1, F } for that board's face blit: P0/P1 = the road
 *  pixel behind the car before/after the face was drawn, F = the face's own pixel there.
 *  Render-only: the cars are held still and the player can't be hurt. */
const carBehindBoard = (page) => page.evaluate(() => new Promise((done) => {
  const g = window.__OT.GameState, t = window.__OT.traffic(), T = window.__OT.track(), ads = window.__OT.ads;
  const PICKUPS = ['HW_COIN', 'PLUTONIUM', 'REPAIR_WRENCH', 'NOS_CAN', 'MAGNET', 'SHIELD', 'DOUBLER'];
  const KINDS = ['LOOP_BANNER', 'START_ARCH', 'GANTRY'];
  const LANES = [0, 0.6, -0.6, 0.3, -0.3];
  const cars = [...t.traffic, ...t.racers];
  const P = CanvasRenderingContext2D.prototype, orig = P.drawImage;
  const px = (ctx, x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  let rec = null;
  P.drawImage = function (img, ...a) {
    const L = ads().lastFade;
    if (rec || !L.item || img !== L.item.fc || a.length !== 4 || this.globalAlpha === 1) return orig.call(this, img, ...a);
    const bd = L.board, bh = L.behind;
    // The middle of where the car's rect and the face overlap.
    const x = Math.max(a[0] + 2, Math.min(a[0] + a[2] - 2, (Math.max(bd[0], bh[0]) + Math.min(bd[2], bh[2])) / 2));
    const y = Math.max(a[1] + 2, Math.min(a[1] + a[3] - 2, (Math.max(bd[1], bh[1]) + Math.min(bd[3], bh[3])) / 2));
    const p = this.getTransform().transformPoint(new DOMPoint(x, y));
    const P0 = px(this, Math.round(p.x), Math.round(p.y));
    orig.call(this, img, ...a);
    const P1 = px(this, Math.round(p.x), Math.round(p.y));
    const F = px(img.getContext('2d'), Math.floor(((x - a[0]) / a[2]) * img.width), Math.floor(((y - a[1]) / a[3]) * img.height));
    rec = { alpha: this.globalAlpha, kind: L.kind, P0, P1, F };
  };
  let camZ = g.trackPos, boardZ = camZ + 1e6;
  const hold = setInterval(() => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 0; g.autoGas = false; g.trackPos = camZ;
    for (let i = T.start; i < T.end; i++) { const sg = T.seg(i); if (sg) for (const it of sg.items) if (PICKUPS.includes(it.type)) it.collected = true; }
    cars.forEach((c, i) => { c.takenDown = false; c.worldZ = boardZ + 200 + i * 250; c.offset = LANES[i % LANES.length]; c.mph = 0; });
  }, 5);
  const frames = (n) => new Promise((r) => { (function f() { if (n-- <= 0) r(); else requestAnimationFrame(f); })(); });
  // The scene stays held (window.__hold) so the test can screenshot it.
  const finish = (r) => { window.__hold = hold; P.drawImage = orig; done(r); };
  const tried = new Set();
  (async () => {
    for (let lap = 0; lap < 30; lap++) {
      for (let i = Math.floor(camZ / 200) + 8; i < T.end - 30; i++) {
        const s = T.seg(i);
        if (tried.has(i) || !s || !s.items.some((it) => it.type === 'BILLBOARD' && KINDS.includes(it.kind))) continue;
        tried.add(i);
        for (const back of [3800, 3400, 4200, 3000, 2600]) {
          boardZ = i * 200; camZ = Math.max(0, boardZ - back);
          const k = ads().covered;
          await frames(3);
          if (rec && ads().covered > k) { finish(rec); return; }
          rec = null;
        }
      }
      boardZ = camZ + 1e6; camZ = (T.end - 20) * 200; // let the ring build further up the road
      await frames(3);
    }
    finish(null);
  })();
}));

// The tall phone view is where it happens for real: the start arch over the grid sits across
// the lanes a few hundred metres on (on every level; at 1280x720 and on tablets the boards stay
// above or beside the lanes, see the next test).
test('a car behind the start arch shows through it (390x844)', async ({ page }, info) => {
  test.slow();
  const problems = watchPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}?debug&view=2d`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.waitForFunction(() => window.__OT.ads && window.__OT.ads(), null, { timeout: 10000 });
  await nextFrames(page, 3);

  const r = await carBehindBoard(page);
  expect(r, 'no spot up the road put a car behind a board').not.toBeNull();
  expect(r.alpha).toBeLessThanOrEqual(0.4);
  // Drawn solid, the face would have moved that pixel all the way to its own colour; drawn
  // see-through it moves it well under half way, so the car behind it still reads.
  const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  const full = dist(r.F, r.P0);
  expect(full, `face ${r.F} vs car ${r.P0}`).toBeGreaterThan(30);
  expect(dist(r.P1, r.P0)).toBeLessThan(full * 0.5);
  await nextFrames(page, 2);
  await page.screenshot({ path: info.outputPath('board-fade-390x844.png') });
  expect(problems).toEqual([]);
});

test('a roadside board beside the traffic stays solid (1280x720)', async ({ page }, info) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=2d`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.waitForFunction(() => window.__OT.ads && window.__OT.ads(), null, { timeout: 10000 });
  // Park before the first roadside board with every car in the lanes around and beyond it, and
  // record the alpha its face is blitted with.
  const r = await page.evaluate(() => new Promise((done) => {
    const g = window.__OT.GameState, t = window.__OT.traffic(), T = window.__OT.track(), ads = window.__OT.ads;
    let seg = 0, board = null;
    for (let i = Math.floor(g.trackPos / 200) + 8; i < T.end && !board; i++) {
      board = T.seg(i) && T.seg(i).items.find((it) => it.type === 'BILLBOARD' && it.kind === 'ROADSIDE');
      seg = i;
    }
    const cars = [...t.traffic, ...t.racers], camZ = seg * 200 - 2600;
    const hold = setInterval(() => {
      g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 0; g.autoGas = false; g.trackPos = camZ;
      cars.forEach((c, i) => { c.takenDown = false; c.worldZ = seg * 200 - 800 + i * 250; c.offset = [0, 0.6, -0.6][i % 3]; c.mph = 0; });
    }, 5);
    const P = CanvasRenderingContext2D.prototype, orig = P.drawImage, alphas = [];
    P.drawImage = function (img, ...a) { if (board && img === board.fc) alphas.push(this.globalAlpha); return orig.call(this, img, ...a); };
    let n = 0, k0 = -1;
    (function tick() {
      if (++n === 4) k0 = ads().covered;
      if (n < 10) { requestAnimationFrame(tick); return; }
      window.__hold = hold; P.drawImage = orig;
      done({ found: !!board, alphas: alphas.slice(-5), covered: ads().covered - k0 });
    })();
  }));
  expect(r.found).toBe(true);
  expect(r.alphas.length).toBeGreaterThan(0);
  for (const a of r.alphas) expect(a).toBe(1);
  expect(r.covered).toBe(0);
  await page.screenshot({ path: info.outputPath('board-solid-1280x720.png') });
  expect(problems).toEqual([]);
});
