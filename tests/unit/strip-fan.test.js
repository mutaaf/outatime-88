// Ticket 0209: a pack of strip markers fans out sideways instead of stacking.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fanOut, createStripFan } from '../../src/strip-marks.js';

const GAP = 2;
/** Lays out markers (leader first) on a strip [lo, hi]; returns placed centres. */
const lay = (x, w, you, lo = 0, hi = 300) => fanOut(x, w, x.length, you, lo, hi, GAP, []);
const boxes = (c, w) => c.map((v, i) => [v - w[i] / 2, v + w[i] / 2]);
const overlaps = (c, w) => {
  const b = boxes(c, w);
  const hits = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    if (b[i][0] < b[j][1] - 1e-9 && b[j][0] < b[i][1] - 1e-9) hits.push([i, j]);
  }
  return hits;
};
/** Leader first means centres never increase down the list (the race order reads left to right). */
const ordered = (c) => c.every((v, i) => i === 0 || v <= c[i - 1] + 1e-9);

describe('strip markers fan out instead of stacking (ticket 0209)', () => {
  it('evenly spaced markers keep their exact spots', () => {
    const x = [250, 200, 150, 100, 50];
    const w = [16, 16, 36, 16, 16];
    expect(lay(x, w, 2)).toEqual(x);
  });

  it('a tight pack ahead of YOU spreads right, in race order, YOU unmoved', () => {
    const x = [101, 100.5, 100, 60];
    const w = [16, 16, 16, 36];
    const c = lay(x, w, 3);
    expect(c[3]).toBe(60);
    expect(overlaps(c, w)).toEqual([]);
    expect(ordered(c)).toBe(true);
  });

  it('identical progress for the whole field: every box apart, YOU at its spot', () => {
    for (let you = 0; you < 7; you++) {
      const x = Array(7).fill(150);
      const w = x.map((_, i) => (i === you ? 36 : 16));
      const c = lay(x, w, you);
      expect(c[you]).toBe(150);
      expect(overlaps(c, w)).toEqual([]);
      expect(ordered(c)).toBe(true);
    }
  });

  it('rivals on top of YOU move off it; the car ahead goes right, the car behind left', () => {
    const x = [120, 120, 120];
    const w = [16, 36, 16];
    const c = lay(x, w, 1);
    expect(c[1]).toBe(120);
    expect(c[0]).toBeGreaterThan(120);
    expect(c[2]).toBeLessThan(120);
    expect(overlaps(c, w)).toEqual([]);
  });

  it('a pack against an end packs back towards YOU and stays inside the strip', () => {
    // three rivals finished (clamped to the flag), YOU a little behind
    const x = [300, 300, 300, 240];
    const w = [16, 18, 16, 36];
    const c = lay(x, w, 3, -19, 319);
    expect(overlaps(c, w)).toEqual([]);
    for (let i = 0; i < c.length; i++) expect(c[i] + w[i] / 2).toBeLessThanOrEqual(319 + 1e-9);
    // the grid: everyone at the start line, YOU starting last
    const gw = [16, 16, 16, 16, 16, 36];
    const g = lay([0, 0, 0, 0, 0, 0], gw, 5, -19, 319);
    expect(g[5]).toBe(0);
    expect(overlaps(g, gw)).toEqual([]);
    expect(ordered(g)).toBe(true);
    // no room left behind YOU at the start line: those cars stay on their side, under YOU, never ahead of it
    const s = lay([0, 0, 0], [16, 36, 16], 1, -19, 319);
    expect(s[2]).toBeLessThanOrEqual(0);
    expect(s[2] - 8).toBeGreaterThanOrEqual(-19);
  });

  it('random fields of up to 7: no overlaps whenever the strip has room, YOU never moves, order kept', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < 3000; t++) {
      const n = 2 + Math.floor(rnd() * 6);
      const W = 120 + rnd() * 900;
      const x = Array.from({ length: n }, () => (rnd() < 0.5 ? W * rnd() : W * (0.4 + rnd() * 0.05))).sort((a, b) => b - a);
      const you = Math.floor(rnd() * n);
      const w = x.map((_, i) => (i === you ? 36 : 14 + rnd() * 12));
      const inset = 19;
      const c = lay(x, w, you, -inset, W + inset);
      expect(c[you]).toBe(x[you]);
      expect(ordered(c)).toBe(true);
      // Room: the cars ahead fit between YOU and the flag end, the cars behind between the start and YOU.
      let ahead = 0, behind = 0;
      for (let i = 0; i < you; i++) ahead += w[i] + GAP;
      for (let i = you + 1; i < n; i++) behind += w[i] + GAP;
      const room = W + inset - (x[you] + w[you] / 2) >= ahead && (x[you] - w[you] / 2) - (-inset) >= behind;
      if (room) expect(overlaps(c, w)).toEqual([]);
      for (let i = 0; i < n; i++) {
        if (i === you) continue;
        expect(c[i] - w[i] / 2).toBeGreaterThanOrEqual(-inset - 1e-9);
        expect(c[i] + w[i] / 2).toBeLessThanOrEqual(W + inset + 1e-9);
      }
    }
  });

  it('reuses the output array (no per-frame allocation)', () => {
    const out = [];
    expect(fanOut([10, 10], [16, 16], 2, 1, 0, 100, GAP, out)).toBe(out);
  });
});

describe('createStripFan: the race HUD placer (ticket 0209)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A fake ResizeObserver the test fires by hand, and a strip 400 px wide inside a 440 px track. */
  function setup() {
    let fire = null;
    const watched = new Set();
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { fire = () => cb([...watched].map((t) => ({ target: t, contentRect: { width: t.w }, borderBoxSize: [{ inlineSize: t.w }] }))); }
      observe(t) { watched.add(t); }
      disconnect() { watched.clear(); }
    });
    const writes = { n: 0 };
    const node = (w) => {
      const style = new Proxy({}, { set(o, k, v) { writes.n++; o[k] = v; return true; } });
      return { w, style };
    };
    const track = { w: 440 };
    const layer = { w: 400, parentNode: track };
    const field = [
      { id: 'a', progress: 101 }, { id: 'b', progress: 100.5 }, { id: 'YOU', progress: 100, isPlayer: true }, { id: 'c', progress: 99 },
    ];
    const dots = new Map(field.map((e) => [e.id, { node: node(e.isPlayer ? 36 : 16), frac: 0.5, left: -1 }]));
    return { fire: () => fire(), writes, layer, field, dots, place: createStripFan() };
  }
  const lefts = (dots) => [...dots.values()].map((d) => d.left);

  it('sits markers at their exact spots until sizes arrive, then fans the pack, writing only on change', () => {
    const t = setup();
    t.place(t.field, t.dots, t.layer);
    expect(lefts(t.dots)).toEqual([50, 50, 50, 50]);
    t.fire();
    t.place(t.field, t.dots, t.layer);
    const [a, b, you, c] = lefts(t.dots);
    expect(you).toBe(50);
    expect(b).toBeGreaterThan(you);
    expect(a).toBeGreaterThan(b);
    expect(c).toBeLessThan(you);
    // b's box (16 px) clears YOU's (36 px) at 400 px: centres at least 26 px apart
    expect(((b - you) / 100) * 400).toBeGreaterThanOrEqual(26);
    const n = t.writes.n;
    t.place(t.field, t.dots, t.layer);
    expect(t.writes.n).toBe(n); // nothing moved, nothing written
  });

  it('a rival level with you keeps its side through a swap inside the deadband', () => {
    const t = setup();
    t.place(t.field, t.dots, t.layer);
    t.fire();
    t.place(t.field, t.dots, t.layer);
    const before = t.dots.get('b').left;
    // b drops 0.5 m behind you: the standings swap, the marker stays right of YOU
    t.field[1].progress = 99.5;
    [t.field[1], t.field[2]] = [t.field[2], t.field[1]];
    t.place(t.field, t.dots, t.layer);
    expect(t.dots.get('b').left).toBe(before);
    // 3 m behind: past the deadband, it goes to YOU's left
    t.field[2].progress = 97;
    t.place(t.field, t.dots, t.layer);
    expect(t.dots.get('b').left).toBeLessThan(50);
  });

  it('without ResizeObserver (or a hidden strip) every marker keeps its exact spot', () => {
    const place = createStripFan();
    const d = { node: { style: {} }, frac: 0.25, left: -1 };
    place([{ id: 'YOU', progress: 0, isPlayer: true }], new Map([['YOU', d]]), {});
    expect(d.left).toBe(25);
  });
});
