// Colour-vision audit (ticket 0198): every pickup must stay distinguishable from every road
// hazard without relying on hue. A fixed race frame (paused, still pose) is rendered with one
// sprite at a time on the same spot of road; each sprite is cut out against the empty road,
// then compared pair by pair under protanopia, deuteranopia, tritanopia and greyscale
// (tests/e2e/cvd.js). A pair passes on mean-luminance contrast >= 1.5:1 or an edge silhouette
// that differs by >= EDGE_MIN, and every pickup must look more like the other pickups than like
// any hazard (one shared outline). The numbers are attached to the report.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';
import { SIMS, spriteStats, compare, LUM_MIN, EDGE_MIN } from './cvd.js';
import { materialFor } from '../../src/materials.js';

const PICKUPS = ['HW_COIN', 'PLUTONIUM', 'REPAIR_WRENCH', 'NOS_CAN', 'MAGNET', 'SHIELD', 'DOUBLER'];
const LANE = -0.5; // the left lane: clear of the player's car, which is drawn over the road
const HAZARDS = ['TRAFFIC_CONE', 'OIL_BARREL', 'PINE_TREE_HAZARD', 'LOW_LASER_BAR', 'HIGH_LIGHT_GATE', 'HOLO_BARRIER'];
// (FLUX_CRATE has no 2D art of its own: it is drawn as the HOLO_BARRIER barricade.)

/** Paused race with an empty stretch of road `ahead` segments in front of the camera. */
async function stage(page, ahead) {
  await page.goto(`${APP}?debug`);
  await page.waitForFunction(() => window.__OT);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // The lazy art first: pickup icons, and the era backdrop + roadside art (the pine hazard's
  // own art, and a sky that would otherwise change under the empty-road reference shots).
  await page.waitForFunction(() => window.__OT.pickupArt() && window.__OT.backdrop()?.id, null, { timeout: 20000 });
  return page.evaluate((ahead) => {
    const OT = window.__OT, g = OT.GameState, tr = OT.track(), lt = OT.traffic();
    g.reducedMotion = true; // calm pose: no coin spin, no rocking, no shake (pickups still bob)
    OT.pause();
    const base = Math.floor(g.trackPos / 200) + ahead;
    for (let i = base - 40; i <= base + 40; i++) { const s = tr.seg(i); if (s) s.items.length = 0; }
    // Nothing else on screen: park every car far behind and keep only our own obstacle.
    for (const c of [...lt.racers, ...lt.traffic]) c.worldZ = -1e6;
    lt.drawObstacles.length = 0;
    return base;
  }, ahead);
}

/** One frame with `type` on segment `seg` (or nothing). The empty road is shot twice first
 *  (`bg`): pixels that differ between those two are live backdrop detail and never count. A
 *  sprite shot returns the box around everything it changed: its pixels, the road's, and a mask. */
function shoot(page, seg, type, pickup) {
  const halfW = type && !pickup ? materialFor(type).halfW : 0;
  return page.evaluate(async ({ seg, type, pickup, halfW, LANE }) => {
    const OT = window.__OT, tr = OT.track(), lt = OT.traffic();
    const s = tr.seg(seg);
    s.items.length = 0;
    lt.drawObstacles.length = 0;
    if (type && pickup) s.items.push({ type, offset: LANE, phase: 0 });
    else if (type) lt.drawObstacles.push({ type, worldZ: seg * 200 + 100, offset: LANE, y: 0, rot: 0, halfW });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.getElementById('gameCanvas');
    const { width: w, height: h } = c;
    const px = c.getContext('2d').getImageData(0, 0, w, h).data;
    const keep = window.__cvd || (window.__cvd = {});
    if (!type) {
      if (!keep.bg || keep.seg !== seg) { keep.bg = px; keep.seg = seg; return null; }
      const noisy = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        noisy[i] = Math.abs(px[o] - keep.bg[o]) + Math.abs(px[o + 1] - keep.bg[o + 1]) + Math.abs(px[o + 2] - keep.bg[o + 2]) > 12 ? 1 : 0;
      }
      keep.noisy = noisy;
      return { noisy: noisy.reduce((a, b) => a + b, 0) };
    }
    const { bg, noisy } = keep;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const on = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      if (noisy[i]) continue;
      if (Math.abs(px[o] - bg[o]) + Math.abs(px[o + 1] - bg[o + 1]) + Math.abs(px[o + 2] - bg[o + 2]) > 36) {
        on[i] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return { w: 0, h: 0, px: [], bg: [], mask: [] };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = { x0, y0, w: cw, h: ch, px: new Array(cw * ch * 3), mask: new Array(cw * ch) };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * w + x0 + x, j = y * cw + x;
      out.mask[j] = on[i];
      for (let k = 0; k < 3; k++) out.px[j * 3 + k] = px[i * 4 + k];
    }
    return out;
  }, { seg, type, pickup, halfW, LANE });
}

test('pickups and hazards stay apart under colour-vision simulation', async ({ page }, info) => {
  test.setTimeout(120000);
  const problems = watchPage(page);
  const seg = await stage(page, 11);
  await nextFrames(page, 4);
  await shoot(page, seg, null);
  const { noisy } = await shoot(page, seg, null);
  expect(noisy, 'the paused road should hold still').toBeLessThan(5000);
  const stats = {};
  for (const type of [...PICKUPS, ...HAZARDS]) {
    stats[type] = spriteStats(await shoot(page, seg, type, PICKUPS.includes(type)));
    expect(stats[type].n, `${type} drew nothing`).toBeGreaterThan(400);
    // Below ~40 px a sprite is too coarse for the 32-cell silhouette to mean anything.
    expect(Math.max(stats[type].w, stats[type].h), `${type} too small to judge`).toBeGreaterThanOrEqual(40);
  }
  const rows = [], fails = [], classes = [];
  for (const sim of Object.keys(SIMS)) {
    // Every pickup / hazard pair: luminance contrast or a different edge silhouette.
    let near = 1, far = 0, nearPair = '', farPair = '';
    for (const p of PICKUPS) for (const h of HAZARDS) {
      const r = compare(stats[p][sim], stats[h][sim]);
      rows.push(`${p} vs ${h} [${sim}] lum ${r.ratio.toFixed(2)}:1 edge ${r.edge.toFixed(2)}`);
      if (!(r.ratio >= LUM_MIN || r.edge >= EDGE_MIN)) fails.push(rows[rows.length - 1]);
      if (r.edge < near) { near = r.edge; nearPair = `${p}/${h}`; }
    }
    // One look for "grab it": any two pickups are closer in silhouette than any pickup is to
    // any hazard, so a player who can't tell the colours still reads the category.
    for (let i = 0; i < PICKUPS.length; i++) for (let j = i + 1; j < PICKUPS.length; j++) {
      const e = compare(stats[PICKUPS[i]][sim], stats[PICKUPS[j]][sim]).edge;
      if (e > far) { far = e; farPair = `${PICKUPS[i]}/${PICKUPS[j]}`; }
    }
    rows.push(`[${sim}] pickups apart at most ${far.toFixed(2)} (${farPair}); pickup-hazard at least ${near.toFixed(2)} (${nearPair})`);
    if (far >= near) classes.push(rows[rows.length - 1]);
  }
  // The noise floor: the same sprites three segments further on (smaller) must still measure
  // as the same, or "different" above would mean nothing.
  const far = seg + 3;
  await shoot(page, far, null);
  await shoot(page, far, null);
  for (const type of ['HW_COIN', 'DOUBLER', 'HOLO_BARRIER']) {
    const again = spriteStats(await shoot(page, far, type, PICKUPS.includes(type)));
    for (const sim of Object.keys(SIMS)) {
      const e = compare(stats[type][sim], again[sim]).edge;
      rows.push(`${type} near vs far [${sim}] edge ${e.toFixed(2)}`);
      expect(e, `${type} at two distances [${sim}]`).toBeLessThan(EDGE_MIN);
    }
  }
  await info.attach('colour-vision.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  // The PR's before/after picture: a 2× badge and a barricade side by side.
  await page.evaluate((seg) => {
    const OT = window.__OT, s = OT.track().seg(seg), lt = OT.traffic();
    s.items.length = 0;
    s.items.push({ type: 'DOUBLER', offset: -0.5, phase: 0 });
    lt.drawObstacles.length = 0;
    lt.drawObstacles.push({ type: 'HOLO_BARRIER', worldZ: (seg + 3) * 200 + 100, offset: 0.45, y: 0, rot: 0, halfW: 0.21 });
  }, seg);
  await nextFrames(page, 3);
  await info.attach('pickup-and-hazard', { body: await page.screenshot(), contentType: 'image/png' });
  expect(fails).toEqual([]);
  expect(classes).toEqual([]);
  expect(problems).toEqual([]);
});
