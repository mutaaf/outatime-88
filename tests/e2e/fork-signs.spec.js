// Fork cue vs. roadside signs (ticket 0242): "◀ SKY-LOOP ⚡" / "TUNNEL ⏱️ ▶" used to hover over a
// gantry or billboard's own text, so a two-second choice was read against competing small print.
// Now the cards are opaque, and any board whose face lies under a card draws see-through (the
// 0203 fade), so the cue is the one text there. The camera walks the fork with the race held; the
// sim is untouched. Reduced motion keeps the FOV push-in off, so road px map to CSS px by scale.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

/** Walk the camera along the fork (and a little past) a segment at a time, holding the race.
 *  For every frame a board reported lying under the cue, map the DOM cards onto the road buffer
 *  and check the reported face really overlaps one. Returns the walk's numbers. */
const walkFork = (page, playerX) => page.evaluate((px) => new Promise((done) => {
  const g = window.__OT.GameState, T = window.__OT.track(), ads = window.__OT.ads;
  const seg = T.liveSegments().find((s) => s.trackType === 'SPLIT_FORK');
  const segLen = seg.p2.world.z - seg.p1.world.z;
  const z0 = seg.p1.world.z - 1250; // tyres on the fork's first segment
  // Boards along the fork, as the track's addBoard makes them: gantries over it and roadside
  // boards beside it, so the walk sweeps their faces up the screen through the cards.
  const forkSegs = T.liveSegments().filter((s) => s.trackType === 'SPLIT_FORK');
  const board = (s, offset, kind) => s.items.push({ offset, type: 'BILLBOARD', collected: undefined, phase: 0, vOff: 0, kind, slot: s.index * 4 + 3, cid: '', mv: -1, bh: 0 });
  if (!window.__forkBoards) {
    window.__forkBoards = true;
    for (const i of [10, 20, 30]) board(forkSegs[i], 0, 'GANTRY');
    for (const i of [18, 30]) { board(forkSegs[i], -1.58, 'ROADSIDE'); board(forkSegs[i], 1.58, 'ROADSIDE'); }
  }
  let camZ = z0;
  const hold = setInterval(() => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 0; g.autoGas = false;
    g.trackPos = camZ; g.playerX = px; g.playerVX = 0;
  }, 5);
  const frames = (n) => new Promise((r) => { (function f() { if (n-- <= 0) r(); else requestAnimationFrame(f); })(); });
  const cards = () => {
    const v = document.getElementById('canvasContainer').getBoundingClientRect();
    return ['forkLeftCard', 'forkRightCard'].map((id) => document.getElementById(id).getBoundingClientRect())
      .filter((r) => r.width > 0).map((r) => ({ l: (r.left - v.left) / v.width, t: (r.top - v.top) / v.height, r: (r.right - v.left) / v.width, b: (r.bottom - v.top) / v.height }));
  };
  (async () => {
    const out = { steps: 0, shown: 0, hits: 0, overlapped: 0, maxAlpha: 0, missed: [] };
    for (let k = 0; k < 68; k++) {
      camZ = z0 + k * segLen / 2;
      await frames(3);
      const c0 = ads().cue.hits;
      await frames(1);
      const cue = ads().cue;
      out.steps++;
      const shown = !document.getElementById('forkChoiceBanner').classList.contains('hidden');
      if (shown) out.shown++;
      if (cue.hits > c0) {
        out.hits++;
        out.maxAlpha = Math.max(out.maxAlpha, cue.maxAlpha);
        const [l, t, r, b] = cue.last;
        const m = 8; // CSS px: the cue box holds the lean's 1.06 scale plus a 4 px margin
        const hit = cards().some((cd) => cd.l * cue.vw - m < r && cd.r * cue.vw + m > l && cd.t * cue.vh - m < b && cd.b * cue.vh + m > t);
        if (hit) out.overlapped++; else out.missed.push({ k, face: [l, t, r, b].map(Math.round), cards: cards() });
      }
    }
    clearInterval(hold);
    done(out);
  })();
}), playerX);

/** Text colour vs. its own card backing: WCAG contrast, and the backing's opacity. */
const cardContrast = (page) => page.evaluate(() => ['forkLeftCard', 'forkRightCard'].map((id) => {
  const cs = getComputedStyle(document.getElementById(id));
  const rgba = (s) => s.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const fg = rgba(cs.color), bg = rgba(cs.backgroundColor);
  const L1 = lum(fg), L2 = lum(bg);
  return { id, ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), bgAlpha: bg.length > 3 ? bg[3] : 1, opacity: Number(cs.opacity) };
}));

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`a board under the fork cue draws see-through, and the cards are opaque, at ${vp.width}x${vp.height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.waitForFunction(() => window.__OT.ads() !== null); // the board art chunk is in
    let total = { hits: 0, overlapped: 0, maxAlpha: 0, shown: 0, missed: [] };
    for (const x of [-0.3, 0.3]) {
      const w = await walkFork(page, x);
      total = { hits: total.hits + w.hits, overlapped: total.overlapped + w.overlapped, maxAlpha: Math.max(total.maxAlpha, w.maxAlpha), shown: total.shown + w.shown, missed: [...total.missed, ...w.missed] };
    }
    expect(total.shown).toBeGreaterThan(80);
    // The walk passes boards under the cards on a landscape screen. On a tall phone the cue sits
    // high above the horizon and a 2D board never climbs that far while the fork is underfoot (a
    // gantry's face stays in the lower half), so there it only must never draw solid under one.
    if (vp.width > vp.height) expect(total.hits).toBeGreaterThan(0);
    // ...every one it reports really sits under a card on screen, and each draws see-through.
    expect(total.missed).toEqual([]);
    expect(total.overlapped).toBe(total.hits);
    expect(total.maxAlpha).toBeLessThanOrEqual(0.36);
    await nextFrames(page);
    for (const c of await cardContrast(page)) {
      expect(c.bgAlpha, c.id).toBe(1);
      expect(c.opacity, c.id).toBe(1);
      expect(c.ratio, c.id).toBeGreaterThanOrEqual(4.5);
    }
    expect(problems).toEqual([]);
    await ctx.close();
  });
}

test('the cue box clears when the fork is behind, so boards are solid again', async ({ page }) => {
  const problems = watchPage(page);
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  await page.evaluate(() => {
    const { GameState, track } = window.__OT;
    const seg = track().liveSegments().find((s) => s.trackType === 'SPLIT_FORK');
    GameState.trackPos = seg.p1.world.z + (seg.p2.world.z - seg.p1.world.z) * 4 - 1250;
    GameState.playerX = -0.3; GameState.playerVX = 0;
  });
  await page.waitForFunction(() => window.__OT.GameState.forkBox && window.__OT.GameState.forkBox.n === 2);
  await page.evaluate(() => { window.__OT.finishRun(); window.__OT.startRace({ intro: true }); });
  await page.waitForFunction(() => window.__OT.GameState.forkBox.n === 0);
  expect(problems).toEqual([]);
});
