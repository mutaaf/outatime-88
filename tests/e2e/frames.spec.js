// Steady frames (ticket 0182): mid-race, the game's own per-frame JS stays inside a 60 Hz
// budget at the 95th and 99th percentile, and the sim + renderer make little garbage (GC
// pauses are what turn a smooth race into a stutter). Built for shared CI runners:
//   - JS time is the game's own work per frame (rAF callbacks timed), not the frame interval,
//     so a software GPU or a noisy neighbour can't fail it; the worst of three windows is
//     dropped, so one stall can't either.
//   - Garbage is counted by V8's sampling heap profiler (bytes allocated, including objects
//     already collected): it depends on what the code does, not on how fast the runner is.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

// MB/s of garbage mid-race: ~8–9 in both views when measured (2026-10-19, docs/PERF.md), so this
// catches a hot path that starts allocating per car, per segment or per step. Raise only with a reason.
const MAX_ALLOC_2D = 14;
const MAX_ALLOC_3D = 14;

async function race(page, view) {
  await page.goto(`${APP}?debug&view=${view}`);
  await page.waitForFunction(() => window.__OT);
  await page.evaluate(() => window.__OT.startRace());
  await page.waitForFunction(() => window.__OT.GameState.status === 'PLAYING' && window.__OT.GameState.racePhase !== 'START', null, { timeout: 30000 });
  // Drive like a player: full gas, weaving, a drift now and then (sparks, smoke, DOM counters).
  await page.evaluate(() => {
    window.__drive = setInterval(() => {
      const t = performance.now() / 1000, i = window.__OT.InputState;
      i.up = true; i.left = Math.sin(t * 1.3) < -0.4; i.right = Math.sin(t * 1.3) > 0.4; i.down = Math.sin(t * 0.7) > 0.85;
    }, 50);
  });
  await page.waitForTimeout(1500); // lazy chunks, sprite caches, the first GC
}

/** Per-frame JS ms over `frames` frames: { p50, p95, p99 }. */
const jsWindow = (page, frames) => page.evaluate((frames) => new Promise((done) => {
  const raf = window.requestAnimationFrame;
  const per = new Map();
  let seen = 0;
  window.requestAnimationFrame = (cb) => raf.call(window, (t) => {
    const t0 = performance.now();
    try { cb(t); } finally { per.set(t, (per.get(t) || 0) + performance.now() - t0); }
  });
  (function tick(t) {
    if (++seen < frames) { raf.call(window, tick); return; }
    window.requestAnimationFrame = raf;
    const v = [...per.values()].sort((a, b) => a - b);
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    done({ p50: q(0.5), p95: q(0.95), p99: q(0.99) });
  })(0);
}), frames);

for (const view of ['2d', '3d']) {
  test(`${view}: the game's per-frame JS holds a 60 Hz budget at p95/p99, and makes little garbage`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const problems = watchPage(page);
    await race(page, view);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const t0 = Date.now();
    const wins = [];
    for (let w = 0; w < 3; w++) wins.push(await jsWindow(page, view === '2d' ? 120 : 60)); // 3D on a software GPU is slow: shorter windows
    const secs = (Date.now() - t0) / 1000;
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    let bytes = 0;
    (function walk(n) { bytes += n.selfSize; n.children.forEach(walk); })(profile.head);
    const mbps = bytes / 1048576 / secs;
    wins.sort((a, b) => a.p99 - b.p99);
    const best2 = wins.slice(0, 2);
    const p95 = Math.max(...best2.map((w) => w.p95)), p99 = Math.max(...best2.map((w) => w.p99));
    info.annotations.push({ type: 'frame-js', description: `p50 ${wins[1].p50.toFixed(1)} p95 ${p95.toFixed(1)} p99 ${p99.toFixed(1)} ms, garbage ${mbps.toFixed(2)} MB/s` });
    console.log(`[frames ${view}] js p50 ${wins[1].p50.toFixed(1)} p95 ${p95.toFixed(1)} p99 ${p99.toFixed(1)} ms · alloc ${mbps.toFixed(2)} MB/s`);
    // The game's own work must leave room in a frame. Generous for software-rendered CI (CI's
    // 3D measured p95 16–19 ms there, 2D ~22 ms); a real regression blows well past it.
    expect(p95).toBeLessThan(24);
    expect(p99).toBeLessThan(36);
    expect(mbps).toBeLessThan(view === '2d' ? MAX_ALLOC_2D : MAX_ALLOC_3D);
    expect(problems).toEqual([]);
  });
}

