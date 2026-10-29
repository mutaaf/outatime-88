// A roadside sponsor board never shows half its text at the screen edge (ticket 0221): as the
// camera closes on a board it grows and slides out past the side of the view, and it now fades
// with the share of its face off screen and never grows past 28% of the view.
// Render-only: the test holds the camera still at a series of spots; the sim is untouched.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

/** Walk the camera up to the next few boards beside the road, two frames per spot, and record
 *  every board face blit: its share off the road buffer (speed is 0, so no FOV crop), its width
 *  as a share of the buffer, and the alpha it was drawn with. */
const sweepBoards = (page) => page.evaluate(() => new Promise((done) => {
  const g = window.__OT.GameState, T = window.__OT.track();
  const BESIDE = ['ROADSIDE', 'LOOP_BANNER', 'GATE_SIGN'];
  const items = []; // the boards the sweep walks up to; a face blit is one of their item.fc
  const P = CanvasRenderingContext2D.prototype, orig = P.drawImage, samples = [];
  P.drawImage = function (img, ...a) {
    if (a.length === 4 && items.some((it) => it.fc === img)) {
      const rw = this.canvas.width / this.getTransform().a;
      const l = a[0], r = a[0] + a[2];
      const out = Math.max(0, -l) + Math.max(0, r - rw);
      samples.push({ out: out / a[2], w: a[2] / rw, alpha: this.globalAlpha });
    }
    return orig.call(this, img, ...a);
  };
  const boards = [];
  for (let i = Math.floor(g.trackPos / 200) + 6; i < T.end - 2 && boards.length < 4; i++) {
    const s = T.seg(i);
    const b = s && s.items.filter((it) => it.type === 'BILLBOARD' && BESIDE.includes(it.kind));
    if (b && b.length) { boards.push(i); items.push(...b); }
  }
  let camZ = g.trackPos;
  const hold = setInterval(() => {
    g.invulnTimer = 30; g.screenShake = 0; g.hp = g.maxHp; g.speed = 0; g.autoGas = false; g.trackPos = camZ;
  }, 5);
  const frames = (n) => new Promise((r) => { (function f() { if (n-- <= 0) r(); else requestAnimationFrame(f); })(); });
  (async () => {
    for (const i of boards) {
      for (let back = 3000; back >= -1000; back -= back > 600 ? 100 : 40) {
        camZ = i * 200 - back;
        await frames(2);
      }
    }
    clearInterval(hold); P.drawImage = orig;
    done({ boards: boards.length, samples, edge: window.__OT.ads().edge });
  })();
}));

for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`a board at the edge of the view fades and stays under 28% wide (${w}x${h})`, async ({ page }) => {
    test.slow();
    const problems = watchPage(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${APP}?debug&view=2d`);
    await page.locator('#btnStartRace').click();
    await racing(page);
    await page.waitForFunction(() => window.__OT.ads && window.__OT.ads(), null, { timeout: 10000 });

    const r = await sweepBoards(page);
    expect(r.boards, 'no board beside the road up ahead').toBeGreaterThan(0);
    const clipped = r.samples.filter((s) => s.out > 0.15);
    expect(clipped.length, 'the sweep never drew a board past the edge').toBeGreaterThan(0);
    for (const s of clipped) expect(s.alpha, `${(s.out * 100).toFixed(0)}% off screen`).toBeLessThanOrEqual(0.6);
    for (const s of r.samples) expect(s.w).toBeLessThanOrEqual(0.28 + 1e-6);
    // Whole boards still draw solid (nothing is behind them: the traffic is up the road).
    expect(r.samples.some((s) => s.out === 0 && s.alpha === 1)).toBe(true);
    expect(r.edge.bright).toBe(0);
    expect(r.edge.maxW).toBeLessThanOrEqual(0.28 + 1e-6);
    expect(problems).toEqual([]);
  });
}
