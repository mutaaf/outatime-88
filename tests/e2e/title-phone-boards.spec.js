// Ticket 0279: 0274 faded title boards behind the desktop PLAY row only, so a portrait phone still
// showed half-read signs beside PLAY, RACE FRIENDS, TILT and VIEW. Every board face the title draws
// is projected to the screen and compared with those controls' DOM rects: a face overlapping one
// must draw below 0.2 alpha, and boards in the open gaps still show. Own spec (LESSONS 2026-11-15).
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

const CONTROLS = ['#btnStartRace', '#btnOpenLive', '#btnTitleTilt', '#btnViewMode'];

for (const [w, h] of [[390, 844], [360, 640]]) {
  test(`no board reads half-hidden behind the phone title's buttons at ${w}x${h} (0279)`, async ({ page }) => {
    test.slow();
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${APP}?debug&view=2d`);
    await page.waitForFunction(() => window.__OT && window.__OT.ads && window.__OT.ads() && window.__OT.titleBoards, null, { timeout: 20000 });
    await expect(page.locator('#btnStartRace')).toBeVisible();
    // The TILT chip shows only on touch devices; unhide it so the stack is the one a phone sees.
    await page.evaluate(() => document.getElementById('btnTitleTilt').classList.remove('hidden'));
    await nextFrames(page, 3);
    await page.evaluate(() => { window.__OT.titleBoards.log = []; window.__t0279 = { hits: [], open: 0, rows: 0 }; });
    // Drain the log into a tally (it caps at 4000 faces): every face over a control, and how many
    // drew clear of them all, mostly solid.
    const read = () => page.evaluate((sel) => {
      const v = document.getElementById('canvasContainer').getBoundingClientRect();
      const rows = sel.map((s) => document.querySelector(s).getBoundingClientRect()).filter((q) => q.width > 0 && q.height > 0);
      const t = window.__t0279;
      t.rows = rows.length;
      for (const [l, tp, r, b, a, vw, vh] of window.__OT.titleBoards.log) {
        // Not racing, so no FOV crop: the buffer maps straight onto the view.
        const L = v.left + (l / vw) * v.width, R = v.left + (r / vw) * v.width;
        const T = v.top + (tp / vh) * v.height, B = v.top + (b / vh) * v.height;
        if (rows.some((q) => L < q.right && R > q.left && T < q.bottom && B > q.top)) { if (t.hits.length < 50 || a >= 0.2) t.hits.push({ a, box: [L, T, R, B].map(Math.round) }); }
        else if (a > 0.5) t.open++;
      }
      window.__OT.titleBoards.log = [];
      return { hits: t.hits, open: t.open, rows: t.rows };
    }, CONTROLS);
    // The attract road brings boards under the stack within a second or two, and (390x844 puts the
    // stack right on the horizon) past it into the gaps within a few more; a starved runner is slower.
    await expect.poll(async () => { const r = await read(); return r.hits.length > 0 && r.open > 0; }, { timeout: 40000 }).toBe(true);
    const r = await read();
    await page.evaluate(() => { window.__OT.titleBoards.log = null; });
    expect(r.rows, 'PLAY, RACE FRIENDS, TILT and VIEW all measured').toBe(4);
    for (const hit of r.hits) expect(hit.a, `board at ${hit.box}`).toBeLessThan(0.2);
    expect(problems).toEqual([]);
  });
}
