// Boards never hide what you race (ticket 0203): a board whose face covers a car, obstacle or
// pickup drawn further up the road this frame draws see-through, and eases back once clear.
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { BOARD_FADE, covers, boardAlpha } from '../../src/board-fade.js';
import { seen, noteSeen } from '../../src/billboards.js';
import { draw2D, SPEC, applyManifest, debug } from '../../src/billboard-art.js';
import { GameState } from '../../src/state.js';

/** A 2D context stand-in: records the alpha every fill and blit is made with. */
function fakeCtx() {
  const ops = [];
  const ctx = {
    globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low',
    fillRect() { ops.push(ctx.globalAlpha); },
    drawImage() { ops.push(ctx.globalAlpha); },
  };
  return { ctx, ops };
}

describe('board fade rules', () => {
  beforeEach(() => { seen.n = 0; });

  it('finds a noted rect that overlaps, and nothing that only lies beside or touches', () => {
    noteSeen(100, 100, 140, 130);
    noteSeen(300, 50, 340, 90);
    expect(covers(seen, 120, 110, 200, 200)).toBe(0);  // a car's corner under the board
    expect(covers(seen, 310, 0, 400, 60)).toBe(1);
    expect(covers(seen, 140, 100, 200, 130)).toBe(-1); // edge to edge is not behind
    expect(covers(seen, 0, 0, 99, 99)).toBe(-1);
    expect(covers(seen, 150, 0, 290, 400)).toBe(-1);    // in the gap between the two
  });

  it('ignores specks too far off to read and stops noting at the cap', () => {
    noteSeen(10, 10, 17, 17);
    expect(seen.n).toBe(0);
    for (let i = 0; i < 200; i++) noteSeen(i, 0, i + 10, 10);
    expect(seen.n).toBe(96);
  });

  it('is see-through while something is behind, solid again after the ease-back', () => {
    expect(boardAlpha(0)).toBe(BOARD_FADE.alpha);
    expect(BOARD_FADE.alpha).toBeLessThanOrEqual(0.4);
    expect(boardAlpha(BOARD_FADE.back / 2)).toBeGreaterThan(BOARD_FADE.alpha);
    expect(boardAlpha(BOARD_FADE.back / 2)).toBeLessThan(1);
    expect(boardAlpha(BOARD_FADE.back)).toBe(1);
    expect(boardAlpha(Infinity)).toBe(1);
  });
});

describe('draw2D with a car behind the board', () => {
  // Faces paint into an OffscreenCanvas; here one whose context swallows every call.
  const noop = () => {};
  const paint = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  beforeAll(() => { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return paint; } }; });
  afterAll(() => { delete globalThis.OffscreenCanvas; });

  // A gantry over the road: roadW 200 → face 340 px wide, centred at x 640, its bottom 160 px
  // above the road row at y 500.
  const roadW = 200, x = 640, roadY = 500;
  const w = SPEC.GANTRY.w * roadW, h = w / SPEC.GANTRY.aspect, bottom = roadY - SPEC.GANTRY.lift * roadW;
  const draw = (item, now) => { const { ctx, ops } = fakeCtx(); draw2D(ctx, item, 0, x, roadY, roadW, 1280, 720, '1985', seen, now); return { ctx, ops }; };
  const gantry = () => ({ type: 'BILLBOARD', kind: 'GANTRY', slot: 4, cid: '', mv: -1 });

  beforeEach(() => { seen.n = 0; });

  it('draws the whole board solid when nothing further up the road is under its face', () => {
    noteSeen(x - 30, roadY - 40, x + 30, roadY); // a car on the road under the gantry, not behind its face
    const { ctx, ops } = draw(gantry(), 1000);
    expect(ops.length).toBeGreaterThan(2);
    for (const a of ops) expect(a).toBe(1);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('draws every part of it see-through when a rival sits behind its face, then restores the alpha', () => {
    noteSeen(x - 20, bottom - h / 2 - 12, x + 20, bottom - h / 2 + 12); // a rival up the road, inside the face
    const { ctx, ops } = draw(gantry(), 1000);
    expect(ops.length).toBeGreaterThan(2);
    for (const a of ops) expect(a).toBeCloseTo(BOARD_FADE.alpha, 5);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('fades a roadside board too when a car up the bend sits behind it', () => {
    const rs = { type: 'BILLBOARD', kind: 'ROADSIDE', slot: 8, cid: '', mv: -1 };
    const bx = x + 1.58 * roadW, rw = SPEC.ROADSIDE.w * roadW, rh = rw / SPEC.ROADSIDE.aspect, rb = roadY - SPEC.ROADSIDE.lift * roadW;
    const { ctx, ops } = fakeCtx();
    noteSeen(bx - rw / 2 - 30, rb - rh / 2, bx - rw / 2 + 10, rb - rh / 2 + 20); // its corner over the board's left edge
    draw2D(ctx, rs, 0, bx, roadY, roadW, 1280, 720, '1985', seen, 1000);
    for (const a of ops) expect(a).toBeCloseTo(BOARD_FADE.alpha, 5);
    seen.n = 0;
    noteSeen(bx - rw / 2 - 50, rb - rh / 2, bx - rw / 2 - 5, rb - rh / 2 + 20); // just clear of it
    const solid = fakeCtx();
    draw2D(solid.ctx, { type: 'BILLBOARD', kind: 'ROADSIDE', slot: 12, cid: '', mv: -1 }, 0, bx, roadY, roadW, 1280, 720, '1985', seen, 1000);
    for (const a of solid.ops) expect(a).toBe(1);
  });

  it('counts no ad view while the face is see-through', () => {
    applyManifest({ v: 1, campaigns: [] });
    const prev = GameState.status;
    GameState.status = 'PLAYING';
    try {
      const item = gantry(), n0 = debug().impressions;
      for (let t = 0; t <= 2000; t += 100) {
        seen.n = 0;
        noteSeen(x - 20, bottom - h / 2 - 12, x + 20, bottom - h / 2 + 12);
        draw(item, 5000 + t);
      }
      expect(debug().impressions).toBe(n0);
      // The same board in plain view for two seconds counts once.
      const clear = { ...gantry(), slot: 20 }; // a fresh board: never faded
      for (let t = 0; t <= 2000; t += 100) { seen.n = 0; draw(clear, 9000 + t); }
      expect(debug().impressions).toBe(n0 + 1);
    } finally { GameState.status = prev; }
  });

  it('eases back to solid once the road behind it is clear', () => {
    const item = gantry();
    noteSeen(x - 20, bottom - h / 2 - 12, x + 20, bottom - h / 2 + 12);
    draw(item, 1000);
    seen.n = 0;
    const mid = draw(item, 1000 + BOARD_FADE.back * 500).ops;
    for (const a of mid) { expect(a).toBeGreaterThan(BOARD_FADE.alpha); expect(a).toBeLessThan(1); }
    for (const a of draw(item, 1000 + BOARD_FADE.back * 1000 + 1).ops) expect(a).toBe(1);
  });
});
