import { describe, it, expect } from 'vitest';
import { placeTips } from '../../src/touch/guide-tips.js';

const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const padBox = (p) => ({ x: p.x - p.d / 2, y: p.y - p.d / 2, w: p.d, h: p.d });

// The default layout at 390x844 (the 2026-10-19 screenshot): WARP and NOS in the right-hand cluster.
const PADS_390 = [
  { x: 331, y: 785, d: 90 }, { x: 78, y: 766, d: 128 }, { x: 250, y: 799, d: 54 }, { x: 276, y: 720, d: 60 },
  { x: 346, y: 701, d: 60 }, { x: 295, y: 651, d: 60 }, { x: 38, y: 674, d: 48 }, { x: 38, y: 614, d: 48 },
  { x: 352, y: 618, d: 48 }, { x: 352, y: 558, d: 48 },
];
const VIEW_390 = { l: 0, t: 125, r: 390, b: 844 };

describe('thumb guide bubbles (0166)', () => {
  it('puts every bubble inside the view, off every pad and off each other', () => {
    const tips = [
      { x: 78, y: 766, d: 128, w: 140, h: 26 },
      { x: 331, y: 785, d: 90, w: 72, h: 28 },
      { x: 250, y: 799, d: 54, w: 119, h: 28 },
    ];
    const at = placeTips(tips, PADS_390, VIEW_390);
    const boxes = at.map((p, i) => p && { x: p.x, y: p.y, w: tips[i].w, h: tips[i].h });
    expect(boxes.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    boxes.forEach((b) => {
      if (!b) return;
      expect(b.x).toBeGreaterThanOrEqual(VIEW_390.l);
      expect(b.y).toBeGreaterThanOrEqual(VIEW_390.t);
      expect(b.x + b.w).toBeLessThanOrEqual(VIEW_390.r);
      expect(b.y + b.h).toBeLessThanOrEqual(VIEW_390.b);
      for (const p of PADS_390) expect(hits(b, padBox(p))).toBe(false);
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i] && boxes[j]) expect(hits(boxes[i], boxes[j])).toBe(false);
  });

  it('sits right above its pad when there is room', () => {
    const [p] = placeTips([{ x: 200, y: 500, d: 60, w: 80, h: 24 }], [{ x: 200, y: 500, d: 60 }], { l: 0, t: 0, r: 400, b: 800 });
    expect(p.x + 40).toBe(200);
    expect(p.y + 24).toBeLessThanOrEqual(500 - 30 - 12);
    expect(p.y + 24).toBeGreaterThan(500 - 30 - 20);
  });

  it('pulls a bubble at the screen edge back inside instead of cutting it off', () => {
    const [p] = placeTips([{ x: 370, y: 500, d: 40, w: 100, h: 24 }], [{ x: 370, y: 500, d: 40 }], { l: 0, t: 0, r: 390, b: 800 });
    expect(p.x + 100).toBeLessThanOrEqual(390);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it('drops a bubble when nothing near its pad is free', () => {
    const pads = [];
    for (let x = 30; x < 400; x += 60) for (let y = 30; y < 400; y += 60) pads.push({ x, y, d: 58 });
    const [p] = placeTips([{ x: 210, y: 210, d: 58, w: 90, h: 26 }], pads, { l: 0, t: 0, r: 400, b: 400 });
    expect(p).toBeNull();
  });

  it('keeps the order: an earlier bubble takes the spot, the next one moves aside', () => {
    const pads = [{ x: 200, y: 400, d: 60 }];
    const tips = [{ x: 200, y: 400, d: 60, w: 80, h: 24 }, { x: 200, y: 400, d: 60, w: 80, h: 24 }];
    const [a, b] = placeTips(tips, pads, { l: 0, t: 0, r: 400, b: 800 });
    expect(a.y).toBeLessThan(400);
    expect(hits({ ...a, w: 80, h: 24 }, { ...b, w: 80, h: 24 })).toBe(false);
  });

  it('stays clear of the pulsing guide ring around another pad', () => {
    // A ringed pad right of the anchor: a bubble may not sit inside its ring's 1.12× pulse.
    const pads = [{ x: 100, y: 300, d: 60 }, { x: 220, y: 300, d: 90, ring: true }];
    const [p] = placeTips([{ x: 100, y: 300, d: 60, w: 100, h: 24 }], pads, { l: 0, t: 0, r: 400, b: 600 });
    const nx = Math.max(p.x, Math.min(220, p.x + 100)), ny = Math.max(p.y, Math.min(300, p.y + 24));
    expect(Math.hypot(nx - 220, ny - 300)).toBeGreaterThanOrEqual(((90 + 18) / 2) * 1.12);
  });

  it('never runs a leader line through an earlier bubble', () => {
    const at = placeTips([
      { x: 78, y: 766, d: 128, w: 140, h: 26 }, { x: 331, y: 785, d: 90, w: 67, h: 26 }, { x: 250, y: 799, d: 54, w: 110, h: 26 },
    ], PADS_390, VIEW_390);
    const tipsWh = [[140, 26], [67, 26], [110, 26]];
    at.forEach((a, i) => {
      if (!a || !a.lead) return;
      at.forEach((o, j) => {
        if (j === i || !o) return;
        const [w, h] = tipsWh[j];
        for (let t = 0; t <= 1; t += 0.02) {
          const px = a.lead.x1 + (a.lead.x2 - a.lead.x1) * t, py = a.lead.y1 + (a.lead.y2 - a.lead.y1) * t;
          expect(px > o.x && px < o.x + w && py > o.y && py < o.y + h).toBe(false);
        }
      });
    });
  });

  it('keeps whole pixels inside a fractional safe area', () => {
    const view = { l: 44.5, t: 124.69, r: 800.3, b: 375.6 };
    const [p] = placeTips([{ x: 60, y: 140, d: 40, w: 90, h: 26 }], [{ x: 60, y: 140, d: 40 }], view);
    expect(p.x).toBeGreaterThanOrEqual(view.l);
    expect(p.y).toBeGreaterThanOrEqual(view.t);
    expect(p.x + 90).toBeLessThanOrEqual(view.r);
    expect(p.y + 26).toBeLessThanOrEqual(view.b);
  });
});
