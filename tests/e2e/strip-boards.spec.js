// The HUD strip stays readable on the grid (ticket 0244): the start gantry stands right over the
// grid and its face used to run behind the track bar, the gap pill and the 0:00.0 timer. A board
// face reaching into the strip now draws see-through there (src/board-fade.js stripFade), easing in
// over STRIP.ramp of the view height so a gantry growing up the screen never pops. The test records
// every board face the road blits during the grid (rect on the road buffer, alpha it is drawn with)
// and maps the strip's on-screen rects onto the buffer itself, so it doesn't trust the game's box.
// Reduced motion keeps the FOV push-in off, so a view share maps straight onto the road buffer.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames } from './helpers.js';

const RAMP = 0.04; // STRIP.ramp: a face this far into the strip must already be see-through

/** Sample `frames` frames of the grid: every board face drawn overlapping the strip. */
const sampleGrid = (page, frames) => page.evaluate(([n, RAMP]) => new Promise((done) => {
  const g = window.__OT.GameState, T = window.__OT.track();
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
  const strip = () => {
    const v = document.getElementById('canvasContainer').getBoundingClientRect();
    return ['hudTrack', 'hudTimes'].map((id) => document.getElementById(id).getBoundingClientRect())
      .filter((r) => r.width > 0).map((r) => ({ l: (r.left - v.left) / v.width, t: (r.top - v.top) / v.height, r: (r.right - v.left) / v.width, b: (r.bottom - v.top) / v.height }));
  };
  const out = { grid: 0, under: 0, deep: 0, solid: [] };
  let k = 0;
  noteFaces();
  (function frame() { try {
    if (k % 10 === 0) noteFaces();
    if (g.racePhase === 'START' && g.status === 'PLAYING') {
      out.grid++;
      const ss = strip();
      for (const f of faces) {
        for (const s of ss) {
          if (!(s.l * f.rw < f.r && s.r * f.rw > f.l)) continue;
          const d = Math.min(s.b * f.rh, f.b) - Math.max(s.t * f.rh, f.t); // how far the face reaches in
          if (d <= 0) continue;
          out.under++;
          if (d < RAMP * f.rh) continue; // still easing in: checked by tests/unit/board-fade.test.js
          out.deep++;
          if (f.alpha > 0.36) out.solid.push({ k, alpha: f.alpha, face: [f.l, f.t, f.r, f.b].map(Math.round), strip: [s.l * f.rw, s.t * f.rh, s.r * f.rw, s.b * f.rh].map(Math.round) });
        }
      }
    }
    faces = [];
    if (++k >= n || g.racePhase === 'RACING') { P.drawImage = orig; done(out); } else requestAnimationFrame(frame);
  } catch (e) { P.drawImage = orig; done({ err: String(e) }); } })();
}), [frames, RAMP]);

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844, touch: true }, { width: 844, height: 390, touch: true }]) {
  test(`no board draws solid behind the HUD strip on the grid at ${vp.width}x${vp.height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.touch, isMobile: !!vp.touch, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const problems = watchPage(page);
    await page.goto(`${APP}?debug&intro`);
    await page.locator('#btnStartRace').click();
    await page.waitForFunction(() => window.__OT && window.__OT.GameState.racePhase === 'START' && window.__OT.GameState.status === 'PLAYING');
    await page.waitForFunction(() => window.__OT.ads() !== null); // the board art chunk is in
    await nextFrames(page);
    const out = await sampleGrid(page, 90);
    expect(out.err).toBeUndefined();
    expect(out.grid).toBeGreaterThan(5);
    // At 1280x720 the start gantry's face stands up through the strip on the grid (the
    // scout's screenshot); on phones the face stands above the strip or below it, so there the check is only that none is ever solid in it.
    if (vp.width === 1280) expect(out.deep).toBeGreaterThan(0);
    expect(out.solid).toEqual([]);
    if (out.under) expect((await page.evaluate(() => window.__OT.ads().strip.hits))).toBeGreaterThan(0);
    expect(problems).toEqual([]);
    await ctx.close();
  });
}
