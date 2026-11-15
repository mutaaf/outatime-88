// Ticket 0274: the desktop title's attract road drove the 88 MPH sign (and other boards) under the
// PLAY row, so RACE FRIENDS and VIEW cut it in half. Every board face drawn on the title is
// projected to the screen here and compared with the controls' DOM rects: a face that overlaps one
// must be drawn below 0.2 alpha. Phones keep their title as it was. Its own spec (LESSONS 2026-10-31).
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

const CONTROLS = ['#btnStartRace', '#btnOpenLive', '#btnViewMode'];

/** Log every board face the title draws for a while, then return the ones overlapping a control
 *  (CSS px), the total logged and the controls' rects. `need` = wait until one overlaps. */
async function boardsUnderRow(page, need) {
  await page.waitForFunction(() => window.__OT && window.__OT.ads && window.__OT.ads() && window.__OT.titleBoards, null, { timeout: 20000 });
  await expect(page.locator('#btnStartRace')).toBeVisible();
  await nextFrames(page, 3);
  await page.evaluate(() => { window.__OT.titleBoards.log = []; });
  const under = (sel) => page.evaluate((sel) => {
    const v = document.getElementById('canvasContainer').getBoundingClientRect();
    const rows = sel.map((s) => document.querySelector(s).getBoundingClientRect());
    const log = window.__OT.titleBoards.log;
    const hits = [];
    for (const [l, t, r, b, a, vw, vh] of log) {
      // Not racing, so no FOV crop: the buffer maps straight onto the view.
      const L = v.left + (l / vw) * v.width, R = v.left + (r / vw) * v.width;
      const T = v.top + (t / vh) * v.height, B = v.top + (b / vh) * v.height;
      for (const q of rows) if (L < q.right && R > q.left && T < q.bottom && B > q.top) { hits.push({ a, box: [L, T, R, B].map(Math.round) }); break; }
    }
    return { hits, n: log.length, rows: rows.map((q) => [q.left, q.top, q.right, q.bottom].map(Math.round)) };
  }, sel);
  if (need) {
    // The attract road brings a board under the row within a second or two; a starved runner is slower.
    await expect.poll(async () => (await under(CONTROLS)).hits.length, { timeout: 30000 }).toBeGreaterThan(0);
  }
  await nextFrames(page, 90);
  const out = await under(CONTROLS);
  await page.evaluate(() => { window.__OT.titleBoards.log = null; });
  return out;
}

// 1280x720 and 1024x768 bring a board under the row within seconds, so they must see one; at
// 1920x1080 the row sits above every board (disjoint), so that size only checks nothing shows solid.
for (const [w, h, need] of [[1280, 720, true], [1920, 1080, false], [1024, 768, true]]) {
  test(`no board reads half-hidden behind the title's PLAY row at ${w}x${h} (0274)`, async ({ page }) => {
    test.slow();
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${APP}?debug&view=2d`);
    const r = await boardsUnderRow(page, need);
    expect(r.n, 'the title drew boards').toBeGreaterThan(0);
    for (const hit of r.hits) expect(hit.a, `board at ${hit.box} under ${JSON.stringify(r.rows)}`).toBeLessThan(0.2);
    expect(problems).toEqual([]);
  });
}

// Phones and landscape phones (a 932 px wide iPhone on its side too) keep their title as it was.
for (const [w, h] of [[390, 844], [932, 430]]) {
  test(`the phone title is unchanged: no board is faded for the PLAY row (${w}x${h}, 0274)`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${APP}?debug&view=2d`);
    await page.waitForFunction(() => window.__OT && window.__OT.ads && window.__OT.ads() && window.__OT.titleBoards, null, { timeout: 20000 });
    await expect(page.locator('#btnStartRace')).toBeVisible();
    await page.evaluate(() => { window.__OT.titleBoards.log = []; });
    await nextFrames(page, 120);
    const t = await page.evaluate(() => { const t = window.__OT.titleBoards; return { hits: t.hits, logged: t.log.length, boards: window.__OT.ads().boards }; });
    expect(t.boards, 'the title drew boards').toBeGreaterThan(0);
    expect({ hits: t.hits, logged: t.logged }).toEqual({ hits: 0, logged: 0 });
    expect(problems).toEqual([]);
  });
}
