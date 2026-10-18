// Offline play (tickets 0075, 0158): after one online visit the whole game (every lazy chunk,
// sound, font, icon and ad) is in the service worker's cache, so it boots and races on a plane
// in Chromium, Firefox and WebKit (Safari's engine). /outatime/api/* is never cached.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { APP, watchPage } from './helpers.js';
import { walk, precacheList } from '../../scripts/precache.mjs';

test.use({ serviceWorkers: 'allow' });

const swList = () => JSON.parse(readFileSync('dist/outatime/sw.js', 'utf8').match(/JSON\.parse\('(.*)'\)/)[1]);

test('sw.js precaches every file the game needs, generated from the build', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'build check: once is enough');
  const sw = readFileSync('dist/outatime/sw.js', 'utf8');
  expect(sw).toMatch(/const VERSION = '[0-9a-f]{12}'/);
  expect(sw).toContain("const BASE = '/outatime/'");
  const list = swList();
  // Exactly what's on disk after the skip rules: nothing missing, nothing stale.
  const onDisk = walk('dist/outatime').filter((f) => f !== 'sw.js' && f !== 'index.html');
  expect(list).toEqual(precacheList(onDisk.filter((f) => f.startsWith('assets/')), onDisk.filter((f) => !f.startsWith('assets/'))));
  for (const want of [/^assets\/index-[\w-]+\.js$/, /^assets\/view-[\w-]+\.js$/, /^assets\/surfaces-[\w-]+\.js$/, /^assets\/bank-[\w-]+\.js$/,
    /^assets\/controller-[\w-]+\.js$/, /^assets\/results-ui-[\w-]+\.js$/, /\.mp3$/, /\.wav$/, /latin-[\w-]+\.woff2$/,
    /^manifest\.webmanifest$/, /^icons\/icon-192\.png$/, /^ads\/manifest\.json$/]) {
    expect(list.some((f) => want.test(f)), String(want)).toBe(true);
  }
  expect(list.some((f) => /\.map$|\.woff$|^og\./.test(f))).toBe(false);
  expect(list.some((f) => f.startsWith('api/'))).toBe(false);
  expect(readFileSync('dist/_headers', 'utf8')).toContain('/outatime/sw.js\n  Cache-Control: no-cache');
});

/** Load online once and wait until the title pill says everything is saved. */
async function goOnlineThenWaitReady(page, url = `${APP}?debug`) {
  await page.goto(url);
  await expect(page.locator('#offlinePill')).toHaveText(/READY FOR OFFLINE/, { timeout: 40_000 });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true);
}

test('after one visit the game boots, races in 2D and 3D, plays sounds and shows boards with no network', async ({ page, context, browserName }) => {
  test.setTimeout(120_000);
  const problems = watchPage(page);
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD' })); } catch { /* fresh */ }
  });
  const BOARD = { board: 'all', mode: 'ARCADE', day: '2026-10-18', entries: [{ rank: 1, initials: 'ACE', score: 2400000 }] };
  if (browserName === 'webkit') {
    // Playwright can't stub requests from a service-worker-controlled page in WebKit, so seed
    // the board the game would have saved on an online visit (Chromium checks the real path).
    await page.addInitScript((b) => {
      const key = '/scores?board=week&mode=ARCADE&limit=10&around=CLD';
      if (!localStorage.getItem('outatime88_boards_v1')) localStorage.setItem('outatime88_boards_v1', JSON.stringify({ [key]: { at: Date.now() - 3600e3, body: b } }));
    }, BOARD);
  }
  await goOnlineThenWaitReady(page);
  if (browserName !== 'webkit') {
    // Look at the board once online so there's something to show on the plane.
    await page.route('**/outatime/api/scores**', (route) => route.fulfill({ json: BOARD }));
    await page.locator('#btnOpenLeaderboard').click();
    await expect(page.locator('#boardList .board-row')).toHaveCount(1);
    await page.locator('#btnCloseLeaderboard').click();
  }

  const status = await page.evaluate(() => new Promise((res) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'ot-sw' && e.data.bytes) res(e.data); });
    navigator.serviceWorker.controller.postMessage({ type: 'ot-sw-status', withSize: true });
  }));
  expect(status.ready).toBe(true);
  expect(status.done).toBe(status.total);
  console.log(`[${browserName}] offline cache: ${status.total} files, ${(status.bytes / 1048576).toFixed(2)} MB`);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#titleScreen')).toBeVisible();
  await expect(page.locator('#offlinePill')).toHaveText(/PLAYING OFFLINE/);
  // Deep links still open offline.
  await page.goto(`${APP}?debug&level=2`);
  await expect(page.locator('#titleScreen')).toBeVisible();

  // The leaderboard shows the last board it saw, marked offline, at once.
  await page.locator('#btnOpenLeaderboard').click();
  await expect(page.locator('#boardStatus')).toContainText('OFFLINE', { timeout: 3000 });
  await expect(page.locator('#boardList .board-row')).toHaveCount(1);
  await page.locator('#btnCloseLeaderboard').click();

  // Live friends say plainly they need the internet (no spinner).
  await page.locator('#btnOpenLive').click();
  await page.locator('#liveCreate').click();
  await expect(page.locator('#liveMsgTitle')).toHaveText(/NEEDS INTERNET/, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.reload();

  // A solo race in 2D…
  await page.locator('#btnStartRace').click();
  await expect(page.locator('#titleScreen')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  // …the recorded sounds load from the cache after that first tap…
  await expect.poll(() => page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(mp3|wav)$/.test(n));
    return urls.length;
  }), { timeout: 15_000 }).toBeGreaterThan(0);
  // …and the 3D view (three.js, lazy) comes up from the cache too.
  await page.evaluate(() => window.__OT.pause());
  await page.goto(`${APP}?debug&view=3d`);
  await expect.poll(() => page.evaluate(() => window.__OT.view && window.__OT.view().mode), { timeout: 20_000 }).toBe('3d');
  await expect(page.locator('#gameCanvas3d')).toHaveCount(1, { timeout: 20_000 });

  await context.setOffline(false);
  expect(problems.filter((p) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|NetworkError|network connection|api\/|WebSocket|internet connection appears to be offline/i.test(p))).toEqual([]);
});

/** A run token the way the server signs it (payload.t is all the client reads). */
const tokenAt = (t) => `${Buffer.from(JSON.stringify({ id: 'r1', t })).toString('base64url')}.sig`;

test('a score whose connection dropped is kept and posts itself when the network is back', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright cannot stub API calls from a service-worker-controlled page in WebKit');
  test.setTimeout(90_000);
  const posts = [];
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD' })); } catch { /* fresh */ }
  });
  await context.route('**/outatime/api/**', (route) => {
    const req = route.request();
    if (req.url().endsWith('/run')) return route.fulfill({ json: { token: tokenAt(Date.now()) } });
    if (req.method() === 'POST' && req.url().includes('/scores')) { posts.push(req.postDataJSON()); return route.fulfill({ json: { ok: true, rank: { all: 3, daily: 1 } } }); }
    return route.fulfill({ json: { board: 'all', mode: 'ARCADE', day: '2026-10-18', entries: [] } });
  });
  await goOnlineThenWaitReady(page);
  await page.keyboard.press('Enter'); // start online: the run gets its token
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  await page.waitForTimeout(800);
  await context.setOffline(true); // …then the plane takes off
  await page.evaluate(() => { window.__OT.GameState.score = 123456; window.__OT.finishRun(); });
  await expect(page.locator('#endRankText')).toContainText("POSTS WHEN YOU'RE BACK ONLINE", { timeout: 10_000 });
  expect(posts).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('outatime88_outbox_v1') || '[]').length)).toBe(1);
  await context.setOffline(false); // landed
  await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
  expect(posts[0].score).toBe(123456);
  // The outbox is rewritten once the server's answer arrives (just after the request).
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('outatime88_outbox_v1') || '[]').length)).toBe(0);
});

test('a race started offline says it saved your best on this device', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('outatime_cruisn_88_save_v2')) localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ initials: 'CLD' })); } catch { /* fresh */ }
  });
  await goOnlineThenWaitReady(page);
  await context.setOffline(true);
  await page.reload();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__OT.GameState.status)).toBe('PLAYING');
  await page.evaluate(() => { window.__OT.GameState.score = 4321; window.__OT.finishRun(); });
  await expect(page.locator('#endRankText')).toContainText('PLAYED OFFLINE', { timeout: 10_000 });
  await context.setOffline(false);
});
