// Shared e2e helpers: console-error capture, external-request guard, canvas sampling.
export const APP = '/outatime/';

/** Every race-HUD block that other UI must never cover (mirrors [data-hud-rect] in index.html). */
export const HUD_PANELS = ['#hudPosCard', '#hudTrack', '#hudTimes', '#hudSpeedCard', '#btnHudSettings'];

/** Default leaderboard API stub: vite preview has no Worker, and a 404 would log an error.
 *  Tests that care about the API register their own page.route afterwards (it wins). */
export function stubApi(page) {
  return page.route('**/outatime/api/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body;
    if (url.pathname.endsWith('/run')) body = { token: 'test-token' };
    else if (req.method() === 'GET') body = { board: 'all', mode: 'ARCADE', day: '2026-10-17', entries: [] };
    else body = { ok: true, rank: { all: 1, daily: 1 } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

export function watchPage(page) {
  const problems = [];
  stubApi(page);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) {
      problems.push(`external request: ${r.url()}`);
    }
  });
  return problems;
}

/** Fraction of sampled pixels on #gameCanvas that are not near-black. */
export function canvasLitFraction(page) {
  return page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let lit = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      n++;
      if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
    }
    return lit / n;
  });
}

export const hudNumber = (page, id) =>
  page.locator(`#${id}`).innerText().then((t) => parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);

/** Real (non-debug) races open with the lineup and lights (ticket 0052): skip the lineup and
 *  wait for green, the way an impatient player would. */
export async function skipToGreen(page, { tap = false } = {}) {
  const skip = page.locator('#rcSkip');
  await skip.waitFor({ state: 'visible', timeout: 3000 });
  if (tap) await skip.tap(); else await skip.click();
  await page.locator('#raceStage').waitFor({ state: 'hidden', timeout: 6000 });
}

/**
 * Frame-cost probe for perf tests on shared CI runners (software GL, noisy neighbours).
 * Waits `warmup` frames (lazy chunks, shader compiles, the first GC), then over `frames`
 * frames records both the rAF interval and the game's own JS time per frame (every rAF
 * callback timed by wrapping requestAnimationFrame). Medians and p90s, not means, so one
 * stall from the runner doesn't fail a run, while a real regression (every frame slower)
 * still does. Returns { interval: { p50, p90 }, js: { p50, p90 } } in ms.
 */
export function frameStats(page, { frames = 120, warmup = 30 } = {}) {
  return page.evaluate(({ frames, warmup }) => new Promise((resolve) => {
    const raf = window.requestAnimationFrame;
    const work = new Map(); // frame timestamp → JS ms spent in its callbacks
    window.requestAnimationFrame = (cb) => raf.call(window, (t) => {
      const t0 = performance.now();
      try { cb(t); } finally { work.set(t, (work.get(t) || 0) + performance.now() - t0); }
    });
    const stamps = [];
    let n = 0;
    (function tick(t) {
      if (n++ >= warmup) stamps.push(t);
      if (stamps.length <= frames) { raf.call(window, tick); return; }
      window.requestAnimationFrame = raf;
      const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
      const gaps = []; for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
      const js = stamps.map((s) => work.get(s)).filter((v) => v != null);
      resolve({ interval: { p50: q(gaps, 0.5), p90: q(gaps, 0.9) }, js: { p50: q(js, 0.5), p90: q(js, 0.9) } });
    })(performance.now());
  }), { frames, warmup });
}
