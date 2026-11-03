// Boards never hide what you race (ticket 0203): a board whose face covers a car, obstacle or
// pickup drawn further up the road this frame draws see-through, and eases back once clear.
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { BOARD_FADE, STRIP, covers, boardAlpha, stripBox, stripFade } from '../../src/board-fade.js';
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

// Ticket 0242: the fork cue's cards are read like something drawn behind the board, so a gantry
// or roadside board under SKY-LOOP / TUNNEL draws see-through and the cue is the one text there.
describe('draw2D under the fork cue (0242)', () => {
  const noop = () => {};
  const paint = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  beforeAll(() => { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return paint; } }; });
  afterAll(() => { delete globalThis.OffscreenCanvas; GameState.forkBox = null; GameState.status = undefined; GameState.reducedMotion = undefined; });
  beforeEach(() => { seen.n = 0; GameState.status = 'PLAYING'; GameState.reducedMotion = true; });

  // The same gantry as above: face x 470..810, y 255..340 (bezel from ~247) on a 1280 × 720 buffer (not racing, so no crop).
  const roadW = 200, x = 640, roadY = 500;
  const draw = (now) => { const { ctx, ops } = fakeCtx(); draw2D(ctx, { type: 'BILLBOARD', kind: 'GANTRY', slot: 4, cid: '', mv: -1 }, 0, x, roadY, roadW, 1280, 720, '1985', seen, now); return ops; };
  const cue = (t, b) => { GameState.forkBox = { n: 2, r: Float32Array.of(0.38, t / 720, 0.49, b / 720, 0.52, t / 720, 0.6, b / 720) }; };

  it('draws see-through while a cue card sits over its face', () => {
    cue(230, 260);
    const ops = draw(5000);
    expect(ops.length).toBeGreaterThan(2);
    for (const a of ops) expect(a).toBeCloseTo(BOARD_FADE.alpha, 5);
    expect(debug().cue.hits).toBeGreaterThan(0);
  });

  it('stays solid with the cue clear of it, or with no cue up', () => {
    cue(200, 240); // above the face
    for (const a of draw(9000)) expect(a).toBe(1);
    GameState.forkBox = { n: 0, r: new Float32Array(8) };
    for (const a of draw(13000)) expect(a).toBe(1);
  });

  it('stays solid once the race is over: the title attract road and results draw on', () => {
    cue(230, 260);
    for (const st of ['GAMEOVER', 'TITLE', undefined]) {
      GameState.status = st;
      for (const a of draw(17000 + 4000 * ['GAMEOVER', 'TITLE', undefined].indexOf(st))) expect(a).toBe(1);
    }
  });
});

describe('the HUD strip (0244)', () => {
  // The strip as 1280 × 720 view shares: track bar 225..1060 × 20..45, times 540..735 × 66..100.
  const view = { left: 0, top: 0, width: 1280, height: 720 };
  const box = stripBox({ n: 0, r: new Float32Array(8) }, [
    { left: 225, top: 20, right: 1060, bottom: 45 }, { left: 540, top: 66, right: 735, bottom: 100 },
  ], view);
  const ramp = STRIP.ramp * 720;

  it('measures each element as view shares, padded, and skips missing or empty ones', () => {
    expect(box.n).toBe(2);
    expect(box.r[3] * 720).toBeCloseTo(45 + STRIP.pad, 4);
    expect(box.r[4] * 1280).toBeCloseTo(540 - STRIP.pad, 4);
    const b2 = stripBox({ n: 0, r: new Float32Array(8) }, [null, { left: 5, top: 5, right: 5, bottom: 9 }], view);
    expect(b2.n).toBe(0);
    expect(stripBox({ n: 3, r: new Float32Array(8) }, [{ left: 0, top: 0, right: 9, bottom: 9 }], { width: 0, height: 0 }).n).toBe(0);
  });

  it('leaves a face below the strip, or beside it, solid', () => {
    expect(stripFade(box, 400, 120, 880, 240, 1280, 720)).toBe(1); // below
    expect(stripFade(box, 1100, 0, 1270, 200, 1280, 720)).toBe(1); // beside: under the speed card's column
    expect(stripFade(null, 400, 0, 880, 240, 1280, 720)).toBe(1);
  });

  it('a face reaching well into the strip draws at the see-through alpha', () => {
    expect(stripFade(box, 230, -20, 1050, 120, 1280, 720)).toBeCloseTo(STRIP.alpha, 5); // above and through it
    expect(stripFade(box, 600, 0, 700, 104, 1280, 720)).toBeCloseTo(STRIP.alpha, 5);
  });

  it('eases with how far a straddling face reaches in, never popping', () => {
    const bottom = 104; // the times box's padded bottom edge
    const at = (d) => stripFade(box, 600, bottom - d, 700, 300, 1280, 720);
    expect(at(-1)).toBe(1);
    expect(at(0)).toBeGreaterThan(0.999);
    const half = at(ramp / 2);
    expect(half).toBeCloseTo(1 - (1 - STRIP.alpha) / 2, 5);
    expect(at(1)).toBeGreaterThan(0.97);
    expect(at(ramp)).toBeCloseTo(STRIP.alpha, 5);
    let prev = 1;
    for (let d = -1; d <= ramp * 2; d += 1) { const f = at(d); expect(f).toBeLessThanOrEqual(prev); expect(prev - f).toBeLessThan(0.05); prev = f; }
  });

  it('eases as a face slides in from the side too (steering, a bend), never popping', () => {
    // Deep in the times box's height band (66..100), sliding right across its left edge at 536.
    const at = (ox) => stripFade(box, 300, 60, 536 + ox, 300, 1280, 720); // below the track bar (padded to 49)
    expect(at(-1)).toBe(1);
    expect(at(ramp / 2)).toBeCloseTo(1 - (1 - STRIP.alpha) / 2, 5);
    expect(at(ramp)).toBeCloseTo(STRIP.alpha, 5);
    let prev = 1;
    for (let ox = -1; ox <= ramp * 2; ox += 1) { const f = at(ox); expect(f).toBeLessThanOrEqual(prev); expect(prev - f).toBeLessThan(0.05); prev = f; }
  });

  it('maps through the FOV push-in crop', () => {
    // At crop 1.1 the view shows the middle of the buffer: the strip's bottom (104 / 720 of the
    // view) lands lower on the buffer, at cy + share × sh.
    const crop = 1.1, sh = 720 / crop, cy = (720 - sh) * 0.46, y = cy + (104 / 720) * sh;
    expect(stripFade(box, 600, y + 1, 700, 300, 1280, 720, crop)).toBe(1);
    expect(stripFade(box, 600, y - ramp, 700, 300, 1280, 720, crop)).toBeLessThan(0.5);
  });
});

describe('draw2D reaching into the HUD strip (0244)', () => {
  const noop = () => {};
  const paint = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  beforeAll(() => { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return paint; } }; });
  afterAll(() => { delete globalThis.OffscreenCanvas; GameState.hudStrip = null; GameState.forkBox = null; GameState.status = undefined; GameState.reducedMotion = undefined; });
  beforeEach(() => { seen.n = 0; GameState.status = 'PLAYING'; GameState.reducedMotion = true; GameState.forkBox = null; });

  // The gantry from above: face x 470..810, y 255..340 (bezel from ~247) on a 1280 × 720 buffer.
  const roadW = 200, x = 640, roadY = 500;
  const draw = (now, item = { type: 'BILLBOARD', kind: 'GANTRY', slot: 5, cid: '', mv: -1 }) => { const { ctx, ops } = fakeCtx(); draw2D(ctx, item, 0, x, roadY, roadW, 1280, 720, '1985', seen, now); return ops; };
  const stripAt = (t, b) => { GameState.hudStrip = { n: 1, r: Float32Array.of(0.2, t / 720, 0.8, b / 720, 0, 0, 0, 0) }; };

  it('a face under the strip draws see-through; no pixel of it at full alpha', () => {
    for (const st of ['PLAYING', 'PAUSED', 'GRID']) {
      GameState.status = st;
      stripAt(200, 300);
      const ops = draw(5000);
      expect(ops.length).toBeGreaterThan(2);
      for (const a of ops) expect(a).toBeCloseTo(STRIP.alpha, 5);
    }
    expect(debug().strip.hits).toBeGreaterThan(0);
  });

  it('stays solid with the strip above it, or once the race is over', () => {
    stripAt(20, 100);
    for (const a of draw(9000)) expect(a).toBe(1);
    stripAt(200, 300);
    for (const st of ['GAMEOVER', 'TITLE', undefined]) {
      GameState.status = st;
      for (const a of draw(13000)) expect(a).toBe(1);
    }
  });
});
