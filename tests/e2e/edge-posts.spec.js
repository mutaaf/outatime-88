// Edge reflector posts (ticket 0282): short posts in the era's rail colour stream past both road
// edges in the 2D race, capped per frame, and the 2061 skyway (no guardrail) has none. A
// screenshot-free probe: it counts the posts' own fills (the reflector cap #fff1b8, see
// src/edge-posts.js) per frame on the road canvas at ~80 mph.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const CAP_COLOR = '#fff1b8', CAP = 48;

async function startRace(page) {
  await page.goto(`${APP}?debug&view=2d`);
  await page.locator('#btnStartRace').click();
  await racing(page);
  // The posts are drawn by the lazy set-piece art chunk: wait until a frame has drawn one.
  await page.evaluate((cap) => new Promise((done) => {
    const P = CanvasRenderingContext2D.prototype, orig = P.fillRect;
    P.fillRect = function (...a) { if (this.fillStyle === cap) { P.fillRect = orig; done(); } return orig.apply(this, a); };
  }), CAP_COLOR);
  await page.evaluate((cap) => {
    const P = CanvasRenderingContext2D.prototype, orig = P.fillRect;
    window.__posts = null;
    P.fillRect = function (x, y, w, h) {
      const B = window.__posts;
      if (B && this.fillStyle === cap) { B.caps++; B.xs.push(x + w / 2); B.cw = this.canvas.width / (this.getTransform().a || 1); } // logical px, like x
      else if (B && this.fillStyle === B.rail) B.bodies++;
      return orig.call(this, x, y, w, h);
    };
  }, CAP_COLOR);
}

/** Switch to era `e`, hold ~80 mph, and count post fills over a few frames. */
const probe = (page, e, rail) => page.evaluate(([e, rail]) => new Promise((done) => {
  const g = window.__OT.GameState;
  g.eraIndex = e;
  const hold = () => { g.invulnTimer = 30; g.hp = g.maxHp; g.speed = 80; };
  hold();
  const frames = [];
  let n = 8;
  window.__posts = null;
  (function tick() {
    const B = window.__posts;
    if (B) frames.push({ caps: B.caps, bodies: B.bodies, left: B.xs.filter((x) => x < B.cw / 2).length, right: B.xs.filter((x) => x >= B.cw / 2).length });
    window.__posts = { caps: 0, bodies: 0, xs: [], cw: 0, rail };
    hold();
    if (n-- > 0) requestAnimationFrame(tick); else { window.__posts = null; done(frames.slice(2)); }
  })();
}), [e, rail]);

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844, touch: true }]) {
  test(`reflector posts pass both edges in the era rail colour, none on the skyway (${vp.width}x${vp.height})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.touch, isMobile: !!vp.touch });
    const page = await context.newPage();
    const problems = watchPage(page);
    await startRace(page);
    // Two railed eras (index 0 and 1985) and the 2061 skyway (index 6).
    for (const [e, rail] of [[0, '#ffaa00'], [1, '#ffb700']]) {
      await nextFrames(page, 3);
      const frames = await probe(page, e, rail);
      expect(frames.length).toBeGreaterThan(3);
      for (const f of frames) {
        expect(f.caps, `era ${e}`).toBeGreaterThan(0);
        expect(f.caps, `era ${e}`).toBeLessThanOrEqual(CAP);
        expect(f.bodies, `era ${e}: a body in the rail colour under every cap`).toBeGreaterThanOrEqual(f.caps);
      }
      expect(frames.some((f) => f.left > 0 && f.right > 0), `era ${e}: posts on both edges`).toBe(true);
    }
    const sky = await probe(page, 6, '#5ef2ff');
    for (const f of sky) expect(f.caps, 'the 2061 skyway has no guardrail, so no posts').toBe(0);
    expect(problems).toEqual([]);
    await context.close();
  });
}
