// A sponsor board never shows half its text at the screen edge (ticket 0221): a board crossing
// the edge of the view fades with the share of its face that is off screen, and a board beside
// the road is never wider than 28% of the view.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EDGE, edgeFade } from '../../src/board-fade.js';
import { seen } from '../../src/billboards.js';
import { draw2D, SPEC, applyManifest, debug } from '../../src/billboard-art.js';
import { GameState } from '../../src/state.js';

describe('edgeFade', () => {
  it('is 1 for a face wholly inside the view', () => {
    expect(edgeFade(0, 100, 1280)).toBe(1);
    expect(edgeFade(1180, 1280, 1280)).toBe(1);
    expect(edgeFade(500, 700, 1280)).toBe(1);
  });

  it('falls with the share of the face outside, on either edge', () => {
    expect(edgeFade(-10, 90, 1280)).toBeLessThan(1);           // 10% off the left
    expect(edgeFade(-10, 90, 1280)).toBeGreaterThan(0.6);
    expect(edgeFade(-15.1, 84.9, 1280)).toBeLessThanOrEqual(0.6); // just over 15% off
    expect(edgeFade(1195, 1295.1, 1280)).toBeLessThanOrEqual(0.6);
    expect(edgeFade(-40, 60, 1280)).toBeLessThanOrEqual(0.1);  // 40% off
    expect(edgeFade(-80, 20, 1280)).toBe(0);
    expect(edgeFade(-10, 90, 1280)).toBeCloseTo(edgeFade(1190, 1290, 1280), 9); // symmetric
  });

  it('only falls as more of the face leaves the view', () => {
    let prev = 1;
    for (let off = 0; off <= 100; off += 2) {
      const a = edgeFade(-off, 100 - off, 1280);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('measures against what the FOV push-in leaves on screen', () => {
    // At a 1.1 push-in the blit shows the middle 1/1.1 of the buffer: 58 px are cut on each side.
    const cut = (1280 - 1280 / 1.1) / 2;
    expect(edgeFade(cut, cut + 100, 1280, 1.1)).toBe(1);
    expect(edgeFade(10, 110, 1280)).toBe(1);
    expect(edgeFade(10, 110, 1280, 1.1)).toBeLessThanOrEqual(0.1); // ~48% of it cut off
  });

  it('a face wider than the view still fades by its own share outside', () => {
    expect(edgeFade(-100, 1380, 1280)).toBeCloseTo(1 - (200 / 1480) / EDGE.fade, 9); // 13.5% off, both sides
  });

  it('gives full fade by the 40% mark', () => {
    expect(EDGE.fade).toBeLessThanOrEqual(0.4);
    expect(EDGE.maxW).toBe(0.28);
  });
});

describe('draw2D at the edge of the view', () => {
  const noop = () => {};
  const paint = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  beforeAll(() => { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return paint; } }; });
  afterAll(() => { delete globalThis.OffscreenCanvas; });
  beforeEach(() => { seen.n = 0; });

  /** Draw a board and return the alpha and rect of its face blit. */
  function face(item, x, roadW, rw = 1280, rh = 720, now = 1000) {
    const out = { alpha: null, rect: null, ops: 0 };
    const ctx = {
      globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low',
      fillRect() { out.ops++; },
      drawImage(img, l, t, w, h) { out.ops++; out.alpha = ctx.globalAlpha; out.rect = [l, t, w, h]; },
    };
    draw2D(ctx, item, 0, x, 500, roadW, rw, rh, '1985', seen, now);
    out.after = ctx.globalAlpha;
    return out;
  }
  const roadside = (slot = 1) => ({ type: 'BILLBOARD', kind: 'ROADSIDE', slot, cid: '', mv: -1 });

  it('draws a board wholly on screen solid', () => {
    const r = face(roadside(), 900, 200); // 160 px face, 820..980
    expect(r.alpha).toBe(1);
  });

  it('fades a roadside board sliding off the left edge, and restores the alpha', () => {
    const w = SPEC.ROADSIDE.w * 200; // 160
    const r = face(roadside(), -0.2 * w + w / 2, 200); // 20% off the left
    expect(r.alpha).toBeLessThanOrEqual(0.6);
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.after).toBe(1);
    const gone = face(roadside(2), -0.42 * w + w / 2, 200); // 42% off: not drawn at all
    expect(gone.ops).toBe(0);
  });

  it('never draws a roadside board wider than 28% of the view, and keeps it in proportion', () => {
    for (const [rw, rh] of [[1280, 720], [390, 844]]) {
      const r = face(roadside(3), rw / 2, 2000, rw, rh); // a huge road: 1600 px uncapped
      expect(r.rect[2]).toBeLessThanOrEqual(rw * 0.28 + 1e-9);
      expect(r.rect[2] / r.rect[3]).toBeCloseTo(SPEC.ROADSIDE.aspect, 5);
    }
    for (const kind of ['LOOP_BANNER', 'GATE_SIGN']) {
      const r = face({ type: 'BILLBOARD', kind, slot: 4, cid: '', mv: -1 }, 640, 2000);
      expect(r.rect[2]).toBeLessThanOrEqual(1280 * 0.28 + 1e-9);
    }
  });

  it('leaves overhead boards spanning the road, solid until you pass under them', () => {
    const r = face({ type: 'BILLBOARD', kind: 'GANTRY', slot: 5, cid: '', mv: -1 }, 640, 300); // 510 px
    expect(r.rect[2]).toBeCloseTo(SPEC.GANTRY.w * 300, 5);
    expect(r.alpha).toBe(1);
    const near = face({ type: 'BILLBOARD', kind: 'START_ARCH', slot: 6, cid: '', mv: -1 }, 640, 1000); // 1900 px: 33% off each side
    expect(near.alpha).toBe(1);
  });

  it('counts no ad view for a board mostly faded at the edge', () => {
    applyManifest({ v: 1, campaigns: [] });
    const prev = GameState.status;
    GameState.status = 'PLAYING';
    try {
      const n0 = debug().impressions, w = SPEC.ROADSIDE.w * 200;
      // 30% off the left: still ≥ 50% on screen, but faded close to nothing.
      for (let t = 0; t <= 2000; t += 100) face(roadside(30), -0.3 * w + w / 2, 200, 1280, 720, 5000 + t);
      expect(debug().impressions).toBe(n0);
      // 10% off the left still reads (alpha ~0.71): it counts once after a second.
      for (let t = 0; t <= 2000; t += 100) face(roadside(31), -0.1 * w + w / 2, 200, 1280, 720, 9000 + t);
      expect(debug().impressions).toBe(n0 + 1);
    } finally { GameState.status = prev; }
  });

  it('?debug tallies boards drawn past the edge', () => {
    const w = SPEC.ROADSIDE.w * 200, n0 = debug().edge.clipped;
    face(roadside(40), -0.2 * w + w / 2, 200);
    face(roadside(41), -0.1 * w + w / 2, 200); // 10% off: not counted
    const d = debug().edge;
    expect(d.clipped).toBe(n0 + 1);
    expect(d.maxW).toBeGreaterThan(0);
  });
});
