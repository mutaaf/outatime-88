// Ticket 0274: on the desktop title the attract road drove the 88 MPH sign under RACE FRIENDS and
// VIEW, so the first screen showed half-read signs beside PLAY. A board face reaching under one of
// the PLAY row's controls now draws nearly gone (TITLE.alpha), easing in over a margin around each.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TITLE, titleBox, titleFade } from '../../src/board-fade.js';
import { seen } from '../../src/billboards.js';
import { draw2D, debug } from '../../src/billboard-art.js';
import { GameState } from '../../src/state.js';

// The 1280x720 title row as measured on the live build: RACE FRIENDS, PLAY, VIEW.
const view = { left: 0, top: 0, width: 1280, height: 720 };
const ROW = [
  { left: 240, top: 230, right: 447, bottom: 277 }, // RACE FRIENDS
  { left: 461, top: 212, right: 819, bottom: 294 }, // PLAY
  { left: 833, top: 232, right: 1008, bottom: 275 }, // VIEW
];
const ramp = TITLE.ramp * 720;

describe('title row rules (0274)', () => {
  const box = titleBox({ n: 0, r: new Float32Array(12) }, ROW, view);

  it('measures each control as view shares, grown by the ramp, and skips hidden ones', () => {
    expect(box.n).toBe(3);
    expect(box.r[0] * 1280).toBeCloseTo(240 - ramp, 3);
    expect(box.r[3] * 720).toBeCloseTo(277 + ramp, 3);
    const hidden = titleBox({ n: 0, r: new Float32Array(12) }, [null, { left: 0, top: 0, right: 0, bottom: 0 }, ROW[0]], view);
    expect(hidden.n).toBe(1);
    expect(titleBox({ n: 2, r: new Float32Array(12) }, ROW, { width: 0, height: 0 }).n).toBe(0);
  });

  it('a sign under RACE FRIENDS (the 88 MPH board in the scout shot) draws below 0.2', () => {
    // 88 MPH board face: x 290..410, y 270..350, its top edge tucked under the RACE FRIENDS pill.
    expect(titleFade(box, 290, 270, 410, 350, 1280, 720)).toBeLessThan(0.2);
    expect(titleFade(box, 290, 270, 410, 350, 1280, 720)).toBeCloseTo(TITLE.alpha, 5);
  });

  it('any face that touches a control at all is at the floor, even a far one smaller than the ramp', () => {
    expect(titleFade(box, 440, 280, 452, 290, 1280, 720)).toBeCloseTo(TITLE.alpha, 5); // 12 px speck at PLAY's corner
    expect(titleFade(box, 600, 293, 760, 420, 1280, 720)).toBeCloseTo(TITLE.alpha, 5); // 1 px under PLAY's bottom
    expect(titleFade(box, 0, 0, 1280, 720, 1280, 720)).toBeCloseTo(TITLE.alpha, 5);
  });

  it('a face clear of the row (beyond the margin) stays solid', () => {
    expect(titleFade(box, 100, 300 + ramp, 400, 500, 1280, 720)).toBe(1); // below the row
    expect(titleFade(box, 1030, 200, 1270, 400, 1280, 720)).toBe(1);     // right of VIEW
    expect(titleFade(null, 290, 270, 410, 350, 1280, 720)).toBe(1);
    expect(titleFade(box, 290, 270, 290, 350, 1280, 720)).toBe(1);          // empty face
  });

  it('eases across the margin, never popping', () => {
    const at = (gap) => titleFade(box, 300, 277 + gap, 420, 400, 1280, 720); // face top `gap` px below RACE FRIENDS
    expect(at(ramp + 1)).toBe(1);
    const mid = at(ramp / 2);
    expect(mid).toBeGreaterThan(TITLE.alpha);
    expect(mid).toBeLessThan(1);
    expect(at(ramp / 4)).toBeLessThan(mid);
    expect(at(0)).toBeCloseTo(TITLE.alpha, 5);
  });
});

describe('draw2D on the title (0274)', () => {
  const noop = () => {};
  const paint = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  const rects = { btnStartRace: ROW[1], btnOpenLive: ROW[0], btnViewMode: ROW[2], canvasContainer: { ...view, right: 1280, bottom: 720 } };
  let onTitle = true;
  beforeAll(() => {
    globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return paint; } };
    globalThis.document = {
      body: { classList: { contains: (c) => c === 'on-title' && onTitle } },
      getElementById: (id) => (rects[id] ? { getBoundingClientRect: () => rects[id] } : null),
      createElement: () => { const c = new globalThis.OffscreenCanvas(1, 1); return c; },
    };
  });
  afterAll(() => { delete globalThis.OffscreenCanvas; delete globalThis.document; delete globalThis.innerWidth; GameState.status = undefined; });
  beforeEach(() => { seen.n = 0; onTitle = true; GameState.status = 'TITLE'; globalThis.innerWidth = 1280; });

  function fakeCtx() {
    const ops = [];
    const ctx = { globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low', fillRect() { ops.push(ctx.globalAlpha); }, drawImage() { ops.push(ctx.globalAlpha); } };
    return { ctx, ops };
  }
  // A roadside board left of the road whose face lands under RACE FRIENDS on a 1280 × 720 buffer.
  const under = (now) => {
    const { ctx, ops } = fakeCtx();
    draw2D(ctx, { type: 'BILLBOARD', kind: 'ROADSIDE', slot: 3, cid: '', mv: -1 }, 0, 340, 360, 120, 1280, 720, '2026', seen, now); // face 292..388 × 270..324
    return ops;
  };

  it('draws a board under the PLAY row nearly gone and reports it', () => {
    const h0 = debug().title.hits;
    const ops = under(1e6);
    expect(ops.length).toBeGreaterThan(2);
    for (const a of ops) expect(a).toBeLessThan(0.2);
    expect(debug().title.hits).toBe(h0 + 1);
    expect(debug().title.alpha).toBeLessThan(0.2);
  });

  it('leaves it solid in a race, on a phone-width window, and off the title', () => {
    GameState.status = 'PLAYING';
    for (const a of under(2e6)) expect(a).toBe(1);
    GameState.status = 'TITLE'; globalThis.innerWidth = 390;
    for (const a of under(3e6)) expect(a).toBe(1);
    globalThis.innerWidth = 1280; onTitle = false;
    for (const a of under(4e6)) expect(a).toBe(1);
  });
});
