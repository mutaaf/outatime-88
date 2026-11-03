// Ticket 0101: rival name tags never pile up; roadside art never fills the screen.
import { describe, it, expect } from 'vitest';
import { drawTags } from '../../src/scenes/tags.js';
const NB = new Float32Array(4);
// Tags fade out over 150 ms (0238): start each case with none left over from the last.
let now = 1e6;
function flush() { for (let i = 0; i < 3; i++) drawTags(fakeCtx(), [], 0, NB, 0, 1180, 820, (now += 1000)); }

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
    flush(); drawTags(ctx, pool, pool.length, NB, 0, 1180, 820, (now += 16));
    expect(ctx.rects.length).toBeLessThanOrEqual(3); // 0238: at most 3 plates on any screen
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
    flush(); drawTags(ctx, pool, pool.length, NB, 0, 390, 844, (now += 16));
    expect(ctx.rects.length).toBeLessThanOrEqual(3);
    const far = fakeCtx();
    flush(); drawTags(far, [tag(200, 300, 5, 'FAR')], 1, NB, 0, 390, 844, (now += 16));
    expect(far.rects.length).toBe(0);
    const mid = fakeCtx();
    flush(); drawTags(mid, [tag(200, 300, 390 * 0.06, 'MID')], 1, NB, 0, 390, 844, (now += 16));
    expect(mid.rects[0].a).toBeGreaterThan(0);
    expect(mid.rects[0].a).toBeLessThan(1);
  });
  it('does not reorder or truncate the caller\'s reusable pool', () => {
    const pool = [tag(0, 300, 10, 'A'), tag(0, 300, 90, 'B'), tag(0, 300, 50, 'C')];
    flush(); drawTags(fakeCtx(), pool, 2, NB, 0, 1180, 820, (now += 16));
    expect(pool.map((t) => t.text)).toEqual(['A', 'B', 'C']);
  });
});
