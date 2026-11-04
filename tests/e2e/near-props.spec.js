// Near-camera props (ticket 0245): the "dark slab with a red-yellow-red band" at the right road
// edge in the first seconds was a LOW_LASER_BAR hurdle (navy #1e293b posts, red #ef4444 beam,
// yellow #fde047 core; src/render/sprites.js drawRoadside) passed on the right: lane-wide
// hurdles are 0.42 road widths, so beside the camera one covered half the view, solid. Props now
// fade at the same depth as the cars beside them (src/near-fade.js propFade): further up the road
// the hurdle is drawn exactly as before; beside the camera it is ≤ 8% of the view and see-through.
// Render-only: the test holds one hurdle in place beside your lane, the player is invulnerable.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const CAP = 0.08;

async function startRace(page) {
  await page.goto(`${APP}?debug`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // Record the hurdle's own fills (its posts and beam) on the road buffer, in that buffer's
  // pixels: the union box per frame, clipped to the canvas, and the alpha it was drawn with.
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype, orig = P.fillRect;
    window.__bar = null;
    P.fillRect = function (x, y, w, h) {
      const B = window.__bar;
      if (B && (this.fillStyle === '#1e293b' || this.fillStyle === '#ef4444') && this.canvas.width >= 200) {
        const m = this.getTransform();
        const xs = [m.a * x + m.c * y + m.e, m.a * (x + w) + m.c * y + m.e, m.a * x + m.c * (y + h) + m.e, m.a * (x + w) + m.c * (y + h) + m.e];
        const f = B.cur;
        f.l = Math.min(f.l, ...xs); f.r = Math.max(f.r, ...xs); f.w = this.canvas.width;
        f.alpha = Math.max(f.alpha, this.globalAlpha);
      }
      return orig.call(this, x, y, w, h);
    };
  });
}

/** Hold one LOW_LASER_BAR `d` units past the camera (the player is 1250 in), right of your
 *  lane, with every other prop and car parked far up the road; its draws over a few frames. */
const barAt = (page, d) => page.evaluate((d) => new Promise((done) => {
  const g = window.__OT.GameState, t = window.__OT.traffic();
  const bar = t.drawObstacles.find((o) => o.type === 'LOW_LASER_BAR');
  if (!bar) { done({ err: 'no LOW_LASER_BAR in drawObstacles: ' + t.drawObstacles.map((o) => o.type).join() }); return; }
  clearInterval(window.__hold);
  const hold = () => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 45;
    for (const o of t.drawObstacles) if (o !== bar) o.worldZ = g.trackPos + 90000;
    for (const c of t.traffic) c.worldZ = g.trackPos + 90000;
    for (const c of t.racers) c.worldZ = g.trackPos + 90000;
    bar.worldZ = g.trackPos + d; bar.offset = g.playerX + 0.4; // clear of you: halfW 0.21 + yours 0.136 bar.y = 0; bar.rot = 0;
    if (bar.vx !== undefined) bar.vx = 0;
    if (bar.vz !== undefined) bar.vz = 0;
  };
  hold();
  window.__hold = setInterval(hold, 5);
  setTimeout(() => {
    const frames = [];
    let n = 4;
    (function tick() { try {
      const B = window.__bar;
      // This callback runs right after the game's own frame, and props are drawn at their worldZ
      // against the camera's blended player Z (src/render-pose.js): the depth the frame drew.
      const cam = g.renderPlayerZ != null ? g.renderPlayerZ - 1250 : g.trackPos;
      if (B && B.cur.w) frames.push({ dz: bar.worldZ - cam, cover: (Math.min(B.cur.w, B.cur.r) - Math.max(0, B.cur.l)) / B.cur.w, alpha: B.cur.alpha });
      window.__bar = { cur: { l: Infinity, r: -Infinity, w: 0, alpha: 0 } };
      if (n-- > 0) { hold(); requestAnimationFrame(tick); } else { window.__bar = null; done({ frames }); }
    } catch (e) { window.__bar = null; done({ err: String(e) }); } })();
  }, 250);
}), d);

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844, touch: true }, { width: 844, height: 390, touch: true }]) {
  test(`a hurdle beside the camera is small and see-through, never a solid slab (${vp.width}x${vp.height})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.touch, isMobile: !!vp.touch, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await startRace(page);

    // Far up the road it is the ordinary, solid hurdle you read and dodge.
    const ahead = await barAt(page, 2300);
    expect(ahead.err).toBeUndefined();
    expect(ahead.frames.length).toBeGreaterThan(0);
    for (const f of ahead.frames) expect(f.alpha).toBe(1);

    // Beside the camera (where the scout saw the slab), down to the near plane: at most 8% of the
    // canvas on screen, and see-through. The player is at 1250 and cars are fully faded from
    // ~1150 (0200); a prop is drawn at its segment (200 long), so every frame whose prop is a
    // full segment past that, 920 or nearer by the depth it was drawn at, is checked.
    let checked = 0, onScreen = 0;
    for (const d of [1000, 950, 900, 850, 800]) {
      const near = await barAt(page, d);
      expect(near.err).toBeUndefined();
      for (const f of near.frames) {
        if (f.dz > 920) continue;
        checked++;
        if (f.cover > 0) onScreen++;
        expect(f.cover, `cover at dz=${Math.round(f.dz)}`).toBeLessThanOrEqual(CAP);
        expect(f.alpha, `alpha at dz=${Math.round(f.dz)}`).toBeLessThan(0.4);
      }
    }
    expect(checked).toBeGreaterThan(3);
    expect(onScreen).toBeGreaterThan(0);
    await page.evaluate(() => clearInterval(window.__hold));
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
