// Billboards (docs/ADS.md): crisp ad-slot boards in 2D and 3D, kid-safe aggregate reporting.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

/** Park the camera a short way before the next board of `kind` (speed 0). Returns its segment. */
function parkBefore(page, kind, back = 1600) {
  return page.evaluate(({ kind, back }) => {
    const T = window.__OT.track(); const G = window.__OT.GameState;
    for (let i = Math.floor(G.trackPos / 200) + 20; i < T.end; i++) {
      const s = T.seg(i);
      if (s && s.items.some((it) => it.type === 'BILLBOARD' && it.kind === kind)) {
        G.trackPos = i * 200 - 1250 - back; G.speed = 0; G.autoGas = false;
        return i;
      }
    }
    return null;
  }, { kind, back });
}

test.use({ deviceScaleFactor: 2 });

test('2D board faces are painted for their size in device pixels, from a capped cache', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=2d&gfx=high`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.ads && window.__OT.ads(), null, { timeout: 10000 });
  expect(await parkBefore(page, 'ROADSIDE')).not.toBeNull();
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ ads: window.__OT.ads(), pk: window.__OT.GameState.pixelScale }));
  expect(r.pk).toBeGreaterThan(1);                          // the road is backed at device pixels (2× DPR here)
  expect(r.ads.lastPx).toBeGreaterThan(0);
  // The face drawn covers its real pixel width (or is the largest bucket).
  expect(r.ads.lastBucket >= Math.min(r.ads.lastPx, 1024)).toBe(true);
  expect(r.ads.faces).toBeGreaterThan(0);
  expect(r.ads.faces).toBeLessThanOrEqual(96);              // LRU-capped cache
  expect(problems).toEqual([]);
});

test('3D boards come from the same campaigns, pooled', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug&view=3d`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => { const v = window.__OT.view(); return v.stats && v.stats.frames > 5; }, null, { timeout: 25000 });
  await parkBefore(page, 'GANTRY', 3000);
  await page.waitForFunction(() => window.__OT.view().stats.boards > 0, null, { timeout: 8000 });
  const s = await page.evaluate(() => window.__OT.view().stats.boards);
  expect(s).toBeLessThanOrEqual(16);
  expect(problems).toEqual([]);
});

test('a viewable board reports one aggregate count when the manifest turns reporting on', async ({ page }) => {
  const problems = watchPage(page);
  const posts = [];
  await page.route('**/outatime/ads/manifest.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ v: 1, report: true, campaigns: [{ id: 'house-daily', creative: { house: 'daily' }, weight: 1, kidSafe: true }] }),
  }));
  await page.route('**/outatime/api/ads/impressions', (route) => {
    posts.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto(`${APP}?debug&view=2d`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.ads && window.__OT.ads() && window.__OT.ads().report, null, { timeout: 10000 });
  await parkBefore(page, 'ROADSIDE', 1400);
  await page.waitForFunction(() => window.__OT.ads().impressions > 0, null, { timeout: 8000 });
  // A new race starts a new road: the finished race's counts go out as one batch.
  await page.evaluate(() => window.__OT.startRace());
  await expect.poll(() => posts.length, { timeout: 8000 }).toBeGreaterThan(0);
  let total = 0;
  for (const body of posts) {
    expect(Object.keys(body).sort()).toEqual(['counts', 'day', 'v']); // nothing else: no ids, no device
    for (const [id, n] of Object.entries(body.counts)) { expect(id).toMatch(/^house-/); total += n; }
  }
  expect(total).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test('with reporting off (the default) nothing is ever sent, and a missing manifest is fine', async ({ page }) => {
  const problems = watchPage(page);
  let sent = 0;
  await page.route('**/outatime/api/ads/**', (route) => { sent++; return route.fulfill({ status: 404, body: '' }); });
  await page.route('**/outatime/ads/manifest.json', (route) => route.abort('internetdisconnected'));
  await page.goto(`${APP}?debug&view=2d`);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.ads && window.__OT.ads(), null, { timeout: 10000 });
  await parkBefore(page, 'ROADSIDE', 1400);
  await page.waitForFunction(() => window.__OT.ads().impressions > 0, null, { timeout: 8000 });
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForTimeout(800);
  expect(sent).toBe(0);
  expect(await page.evaluate(() => window.__OT.ads().campaigns)).toBe(7); // the built-in house pool
  expect(problems.filter((p) => !p.includes('manifest.json') && !p.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([]);
});
