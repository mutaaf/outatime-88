// Fork cue vs. roadside signs (ticket 0242): "◀ SKY-LOOP ⚡" / "TUNNEL ⏱️ ▶" used to hover over a
// gantry or billboard's own text, so a two-second choice was read against competing small print.
// Now the cards are opaque, and any board whose face lies under a card draws see-through (the
// 0203 fade), so the cue is the one text there. The camera walks the fork with the race held; the
// sim is untouched. Reduced motion keeps the FOV push-in off, so a view share maps straight onto
// the road buffer (the crop is covered by tests/unit/fork.test.js).
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

/** Walk the camera along the fork half a segment at a time, holding the race. Every board face
 *  the road blits is recorded (rect on the road buffer and the alpha it is drawn with); after each
 *  step the cards' on-screen rects are mapped onto the buffer and every face overlapping one must
 *  be see-through. Independent of the game's own cue box: the faces come from the canvas calls. */
const walkFork = (page, playerX) => page.evaluate((px) => new Promise((done) => {
  const g = window.__OT.GameState, T = window.__OT.track();
  const forkSegs = T.liveSegments().filter((s) => s.trackType === 'SPLIT_FORK');
  const segLen = forkSegs[0].p2.world.z - forkSegs[0].p1.world.z;
  const z0 = forkSegs[0].p1.world.z - 1250; // tyres on the fork's first segment
  // Boards along the fork, as the track's addBoard makes them: gantries over it and roadside
  // boards beside it, so the walk sweeps their faces up the screen through the cards.
  const board = (s, offset, kind) => s.items.push({ offset, type: 'BILLBOARD', collected: undefined, phase: 0, vOff: 0, kind, slot: s.index * 4 + 3, cid: '', mv: -1, bh: 0 });
  if (!window.__forkBoards) {
    window.__forkBoards = true;
    for (const i of [10, 20, 30]) board(forkSegs[i], 0, 'GANTRY');
    for (const i of [18, 30]) { board(forkSegs[i], -1.58, 'ROADSIDE'); board(forkSegs[i], 1.58, 'ROADSIDE'); }
  }
  const faceImgs = new Set();
  const noteFaces = () => { for (const s of T.liveSegments()) for (const it of s.items) if (it.type === 'BILLBOARD' && it.fc) faceImgs.add(it.fc); };
  let faces = [];
  const P = CanvasRenderingContext2D.prototype, orig = P.drawImage;
  P.drawImage = function (img, ...a) {
    if (a.length === 4 && faceImgs.has(img)) {
      const m = this.getTransform();
      faces.push({ l: a[0], t: a[1], r: a[0] + a[2], b: a[1] + a[3], alpha: this.globalAlpha, rw: this.canvas.width / m.a, rh: this.canvas.height / m.d });
    }
    return orig.call(this, img, ...a);
  };
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
    const out = { shown: 0, under: 0, solid: [] };
    for (let k = 0; k < 68; k++) {
      camZ = z0 + k * segLen / 2;
      await frames(3);
      noteFaces();
      faces = [];
      await frames(1);
      if (document.getElementById('forkChoiceBanner').classList.contains('hidden')) continue;
      out.shown++;
      const cs = cards();
      for (const f of faces) {
        // Reduced motion: no FOV push-in, so a view share maps straight onto the buffer.
        if (!cs.some((c) => c.l * f.rw < f.r && c.r * f.rw > f.l && c.t * f.rh < f.b && c.b * f.rh > f.t)) continue;
        out.under++;
        if (f.alpha > 0.36) out.solid.push({ k, alpha: f.alpha, face: [f.l, f.t, f.r, f.b].map(Math.round), cards: cs.map((c) => [c.l * f.rw, c.t * f.rh, c.r * f.rw, c.b * f.rh].map(Math.round)), box: g.forkBox && Array.from(g.forkBox.r) });
      }
    }
    clearInterval(hold);
    P.drawImage = orig;
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
  // filter: brightness() isn't in the computed colours: apply it (the card not leant toward dims).
  const k = (cs.filter.match(/brightness\(([\d.]+)\)/) || [0, 1])[1] * 1;
  const fg = rgba(cs.color).slice(0, 3).map((c) => c * k), bg = rgba(cs.backgroundColor).map((c, i) => (i < 3 ? c * k : c));
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
    let shown = 0, under = 0, solid = [];
    for (const x of [-0.3, 0.3]) {
      const w = await walkFork(page, x);
      shown += w.shown; under += w.under; solid = solid.concat(w.solid);
    }
    expect(shown).toBeGreaterThan(80);
    // The walk passes board faces under the cards on a landscape screen. On a tall phone the cue
    // sits high above the horizon and a 2D board never climbs that far while the fork is underfoot
    // (a gantry's face stays in the lower half), so there the check is only that none is ever solid under one.
    if (vp.width > vp.height) expect(under).toBeGreaterThan(0);
    // Every face drawn over a card's on-screen rect is see-through (0203's 0.35).
    expect(solid).toEqual([]);
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
