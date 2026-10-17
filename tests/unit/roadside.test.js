// Ticket 0101: rival name tags never pile up; roadside art never fills the screen.
import { describe, it, expect } from 'vitest';
import { drawTags } from '../../src/scenes/roadside.js';

function fakeCtx() {
  const rects = [];
  return {
    rects, font: '', textAlign: '', textBaseline: '', fillStyle: '', globalAlpha: 1,
    measureText: (t) => ({ width: t.length * 7 }),
    fillRect(x, y, w, h) { if (h > 4) rects.push({ x, y, w, h, a: this.globalAlpha }); },
    fillText() {},
  };
}
const tag = (x, y, w, text) => ({ x, y, w, text, kind: 2, color: '#0ff' });

describe('rival name tags', () => {
  it('a pack of cars bunched at the start gets readable, non-overlapping tags, nearest first', () => {
    const ctx = fakeCtx();
    const pool = ['RIN', 'VEX', 'KAI', 'CAL', 'DEZ', 'MOX'].map((n, i) => tag(600 + (i % 2) * 8, 400, 200 - i * 10, n));
    drawTags(ctx, pool, pool.length, 1180, 820);
    expect(ctx.rects.length).toBeLessThanOrEqual(5);
    expect(ctx.rects.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < ctx.rects.length; i++) {
      for (let j = i + 1; j < ctx.rects.length; j++) {
        const a = ctx.rects[i], b = ctx.rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${i} vs ${j}`).toBe(false);
      }
    }
  });
  it('phones show at most 3 tags; far cars get none; tags fade in with nearness', () => {
    const ctx = fakeCtx();
    const pool = Array.from({ length: 8 }, (_, i) => tag(30 + i * 45, 300, 60 - i * 3, `R${i}`));
    drawTags(ctx, pool, pool.length, 390, 844);
    expect(ctx.rects.length).toBeLessThanOrEqual(3);
    const far = fakeCtx();
    drawTags(far, [tag(200, 300, 5, 'FAR')], 1, 390, 844);
    expect(far.rects.length).toBe(0);
    const mid = fakeCtx();
    drawTags(mid, [tag(200, 300, 390 * 0.06, 'MID')], 1, 390, 844);
    expect(mid.rects[0].a).toBeGreaterThan(0);
    expect(mid.rects[0].a).toBeLessThan(1);
  });
  it('does not reorder or truncate the caller\'s reusable pool', () => {
    const pool = [tag(0, 300, 10, 'A'), tag(0, 300, 90, 'B'), tag(0, 300, 50, 'C')];
    drawTags(fakeCtx(), pool, 2, 1180, 820);
    expect(pool.map((t) => t.text)).toEqual(['A', 'B', 'C']);
  });
});
