import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NEAR, nearFade, nearAlpha, nearScale } from '../../src/near-fade.js';
import { drawCarAt, drawNear, clearSpriteCache, setSpriteScale } from '../../src/car-sprite.js';

// Near-camera traffic (ticket 0200): a car passing beside the camera eases down to a quarter of
// the view and fades to 35%; cars ahead of you are drawn exactly as before.

describe('nearFade / nearAlpha / nearScale', () => {
  it('is 0 ahead of the zone, 1 past it, and never goes back the other way', () => {
    expect(nearFade(0)).toBe(0);
    expect(nearFade(0.16)).toBe(0);           // a few car lengths ahead
    expect(nearFade(NEAR.from)).toBe(0);
    expect(nearFade(NEAR.to)).toBe(1);
    expect(nearFade(0.4)).toBe(1);            // the near plane
    expect(nearFade(NaN)).toBe(0);
    let prev = 0;
    for (let q = 0; q <= 0.5; q += 0.002) {
      const t = nearFade(q);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });

  it('fades from opaque to the near-plane alpha', () => {
    expect(nearAlpha(0)).toBe(1);
    expect(nearAlpha(1)).toBeCloseTo(0.35, 5);
    expect(nearAlpha(5)).toBeCloseTo(0.35, 5);
    expect(nearAlpha(-1)).toBe(1);
    expect(nearAlpha(0.5)).toBeGreaterThan(0.35); expect(nearAlpha(0.5)).toBeLessThan(1);
  });

  it('caps a wide body at the cover limit only as the fade completes', () => {
    expect(nearScale(0.1, 1)).toBe(1);                      // small cars keep their size
    expect(nearScale(0.8, 0)).toBe(1);                      // ahead: untouched
    expect(0.8 * nearScale(0.8, 1)).toBeCloseTo(NEAR.cover, 6);
    expect(NEAR.cover).toBeLessThanOrEqual(0.25);
    const half = 0.8 * nearScale(0.8, 0.5);
    expect(half).toBeLessThan(0.8); expect(half).toBeGreaterThan(NEAR.cover);
  });
});

// A recording 2D context: sprites paint into no-op canvases, the road ctx logs its drawImage calls.
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    return new Proxy({}, {
      get(_, k) { return k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}; },
      set() { return true; },
    });
  }
}
const roadCtx = (w) => {
  const ctx = { canvas: { width: w }, globalAlpha: 1, draws: [] };
  ctx.drawImage = (img, x, y, dw, dh) => ctx.draws.push({ img, x, dw, dh, alpha: ctx.globalAlpha });
  return ctx;
};
const SEMI = { shape: 'SEMI_TRUCK', body: '#cbd5e1', cabin: '#94a3b8', glow: '' };
const SEDAN = { shape: 'SEDAN', body: '#334155', cabin: '#64748b', glow: '' };

describe('drawNear (2D traffic)', () => {
  beforeEach(() => { vi.stubGlobal('OffscreenCanvas', FakeCanvas); clearSpriteCache(); setSpriteScale(1); });

  for (const vw of [1280, 390]) {
    it(`a semi side-on beside the camera covers at most 25% of a ${vw} px view, translucent`, () => {
      const ctx = roadCtx(vw);
      drawCarAt(ctx, SEMI, vw * 0.8, 600, vw * 0.36, { yaw: -0.4 });
      const full = ctx.draws.pop();
      expect(full.dw * full.img.body / vw).toBeGreaterThan(0.5); // the old slab
      drawNear(ctx, SEMI, vw * 0.8, 600, vw * 0.36, { yaw: -0.4 });
      const d = ctx.draws.pop();
      expect(d.dw * d.img.body / vw).toBeLessThanOrEqual(0.25);
      expect(d.alpha).toBeCloseTo(0.35, 5);
      expect(ctx.globalAlpha).toBe(1); // restored
    });
  }

  it('the body box is a share of the sprite, wider side-on than from behind', () => {
    const ctx = roadCtx(1280);
    drawNear(ctx, SEMI, 600, 600, 100, { yaw: 0 });
    drawNear(ctx, SEMI, 600, 600, 100, { yaw: -0.5 });
    const [rear, side] = ctx.draws;
    expect(rear.img.body).toBeGreaterThan(0.2); expect(rear.img.body).toBeLessThanOrEqual(1);
    expect(side.img.body).toBeGreaterThan(rear.img.body);
  });

  it('cars ahead of the zone are drawn exactly as drawCarAt draws them', () => {
    const ctx = roadCtx(1280);
    for (const look of [SEMI, SEDAN]) {
      drawCarAt(ctx, look, 700, 500, 1280 * 0.18, { yaw: 0.2 });
      drawNear(ctx, look, 700, 500, 1280 * 0.18, { yaw: 0.2 });
      const [a, b] = ctx.draws.splice(0);
      expect(b).toEqual(a);
    }
  });

  it('honours the backing scale: the same view at 2x device pixels fades the same', () => {
    const one = roadCtx(1280), two = roadCtx(2560);
    drawNear(one, SEDAN, 900, 600, 1280 * 0.27, { yaw: -0.2 });
    setSpriteScale(2);
    drawNear(two, SEDAN, 900, 600, 1280 * 0.27, { yaw: -0.2 });
    expect(two.draws[0].alpha).toBeCloseTo(one.draws[0].alpha, 6);
    expect(two.draws[0].alpha).toBeLessThan(1);
  });

  it('keeps the thrust anchors on the shrunken car', () => {
    const ctx = roadCtx(1280), out = { n: 0, x: new Float32Array(4), y: new Float32Array(4), r: new Float32Array(4), px: new Float32Array(4), py: new Float32Array(4) };
    drawNear(ctx, SEDAN, 900, 600, 1280 * 0.4, { yaw: 0 }, out);
    const d = ctx.draws[0];
    expect(out.w).toBeCloseTo(d.dw, 6);
    for (let i = 0; i < out.n; i++) { expect(out.x[i]).toBeGreaterThan(d.x); expect(out.x[i]).toBeLessThan(d.x + d.dw); }
  });
});
