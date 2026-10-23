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

/**
 * Resolve after the page has drawn `n` more frames. State that the renderer derives each frame
 * (the loop ride blend, what the canvas shows) is only current once a frame has run after you
 * change the game: on a starved CI runner a fixed wall-clock wait can pass with no frame at all.
 */
export function nextFrames(page, n = 2) {
  return page.evaluate((n) => new Promise((done) => {
    let left = n;
    (function tick() { if (left-- <= 0) done(); else requestAnimationFrame(tick); })();
  }), n);
}

/**
 * Wait until `seconds` of race (simulation) time have passed. The sim runs slower than the
 * wall clock on a loaded runner, so `waitForTimeout` can end before the game has moved at all.
 * Also returns early if the race stops running (it ended, or paused): the clock won't move.
 * Resolves true if the time passed while racing.
 */
export async function simWait(page, seconds, { timeout = 20000 } = {}) {
  const t0 = await page.evaluate(() => window.__OT.GameState.raceTime);
  await page.waitForFunction(([t, s]) => { const g = window.__OT.GameState; return g.raceTime - t >= s || g.status !== 'PLAYING'; }, [t0, seconds], { timeout });
  return page.evaluate(([t, s]) => window.__OT.GameState.raceTime - t >= s, [t0, seconds]);
}

/** Wait until a started race is really running: past the lights and its first sim steps. */
export async function racing(page, { minTime = 0.3, timeout = 20000 } = {}) {
  await page.waitForFunction((m) => {
    const g = window.__OT && window.__OT.GameState;
    return g && g.status === 'PLAYING' && g.racePhase !== 'START' && g.raceTime >= m;
  }, minTime, { timeout });
}

/** Touch devices: wait until the lazily loaded touch kit (stick, buttons, gestures) is live. */
export function touchReady(page, { timeout = 20000 } = {}) {
  return page.waitForFunction(() => Boolean(window.__OT && window.__OT.touch && window.__OT.touch()), null, { timeout });
}

/**
 * Flash probe (ticket 0188), test-only: every animation frame it records how strongly the
 * full-screen flash layers are lit — the DOM overlays (`#warpFlash`, `#abilityTintOverlay`:
 * computed opacity × background alpha) and any translucent light wash drawn across a 2D canvas
 * from its top-left corner (the storm-bolt and era-lightning washes; a board face swelling past
 * the camera is not a flash). Call `installFlashProbe` before `goto`, then
 * `startFlashProbe` / `stopFlashProbe` around the moment under test; `flashRises` counts them.
 */
export const FLASH_MIN = 0.1;

export function installFlashProbe(page) {
  return page.addInitScript(() => {
    const P = { canvas: 0 };
    window.__flash = P;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      const c = this.canvas, s = this.fillStyle;
      if (typeof s === 'string' && c.width >= 320) {
        const t = this.getTransform(); // in canvas pixels, whatever scale the drawer works in
        const X = t.a * x + t.c * y + t.e, Y = t.b * x + t.d * y + t.f, W = t.a * w, H = t.d * h;
        const m = Math.abs(X) < 1 && Math.abs(Y) < 1 && Math.abs(W - c.width) < c.width * 0.1 && H >= c.height * 0.3
          && /^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/.exec(s);
        if (m && +m[1] + +m[2] + +m[3] >= 600) P.canvas = Math.max(P.canvas, +m[4] * this.globalAlpha);
      }
      return fill.call(this, x, y, w, h);
    };
  });
}

export function startFlashProbe(page) {
  return page.evaluate(() => {
    const P = window.__flash;
    const alphaOf = (bg) => {
      const m = /\/\s*([\d.]+)\s*\)$/.exec(bg) || /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(bg);
      return m ? +m[1] : (bg === 'transparent' ? 0 : 1);
    };
    const els = ['warpFlash', 'abilityTintOverlay'].map((id) => document.getElementById(id));
    P.samples = []; P.on = true; P.canvas = 0;
    (function tick() {
      if (!P.on) return;
      const s = { t: performance.now(), sim: window.__OT.GameState.raceTime, canvas: P.canvas };
      P.canvas = 0;
      for (const el of els) {
        const cs = getComputedStyle(el);
        s[el.id] = (parseFloat(cs.opacity) || 0) * alphaOf(cs.backgroundColor);
      }
      P.samples.push(s);
      requestAnimationFrame(tick);
    })();
  });
}

/** Stops the probe; returns its per-frame samples ({ t, sim, canvas, warpFlash, abilityTintOverlay }). */
export function stopFlashProbe(page) {
  return page.evaluate(() => { window.__flash.on = false; return window.__flash.samples; });
}

/** The most times the flash level (strongest layer per frame) rose to `min` in any one-second
 *  window, by wall clock (`t`, ms) and by race clock (`sim`, s); plus each layer's peak. */
export function flashRises(samples, min = FLASH_MIN) {
  const layers = ['canvas', 'warpFlash', 'abilityTintOverlay'];
  const peak = Object.fromEntries(layers.map((k) => [k, Math.max(0, ...samples.map((s) => s[k]))]));
  const rises = [];
  let lit = false;
  for (const s of samples) {
    const on = Math.max(...layers.map((k) => s[k])) >= min;
    if (on && !lit) rises.push(s);
    lit = on;
  }
  const most = (key, span) => {
    let best = 0;
    for (let i = 0, j = 0; i < rises.length; i++) {
      while (rises[i][key] - rises[j][key] >= span) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  };
  return { rises: rises.length, perSecond: Math.max(most('t', 1000), most('sim', 1)), peak };
}
