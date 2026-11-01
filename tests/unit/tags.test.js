// Ticket 0238: bunched rival nameplates never stack on each other or on a pickup in the lane
// ahead; the rivals directly ahead of and behind you always keep theirs; plates fade, never pop.
import { describe, it, expect } from 'vitest';
import { layoutTags, drawTags, placed, MAX, FADE } from '../../src/scenes/tags.js';

const ctx = { measureText: (t) => ({ width: t.length * 8 }) };
const tag = (x, y, w, text, keep = false) => ({ x, y, w, text, kind: 2, color: '#0ff', keep });
const rects = (k) => Array.from({ length: k }, (_, i) => {
  const o = i * 6;
  return { x: placed[o] - placed[o + 2] / 2, y: placed[o + 1] - placed[o + 3] / 2, w: placed[o + 2], h: placed[o + 3], i: placed[o + 5] };
});
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const blocks = (list) => { const b = new Float32Array(4 * 16); list.forEach((r, i) => b.set(r, i * 4)); return b; };
const asRect = ([x, y, w, h]) => ({ x: x - w / 2, y: y - h / 2, w, h });

// The 1280x720 grid from the ticket: five rivals in a knot at the vanishing point, a pickup
// ring right under them, RIN the car directly ahead of you.
const NAMES = ['DEZ', 'KAI', 'CAL', 'VEX', 'RIN'];
function bunched(rw, keepName = 'RIN') {
  const cx = rw / 2;
  return NAMES.map((n, i) => tag(cx - 40 + (i % 3) * 30, 360 + (i % 2) * 8, 80 + i * 6, n, n === keepName));
}
const PICKUP = (rw) => [rw / 2, 392, 36, 36];

describe('rival nameplate layout (0238)', () => {
  for (const [rw, rh, fs] of [[1280, 720, 11], [390, 844, 9]]) {
    it(`six bunched cars at ${rw}x${rh}: no two plates overlap, none covers the pickup, at most ${MAX}`, () => {
      const pool = bunched(rw);
      const B = PICKUP(rw);
      const k = layoutTags(ctx, pool, pool.length, blocks([B]), 1, rw, rh, fs);
      const r = rects(k);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThanOrEqual(MAX);
      for (let i = 0; i < r.length; i++) {
        expect(overlap(r[i], asRect(B)), `${pool[r[i].i].text} over the pickup`).toBe(false);
        expect(r[i].x).toBeGreaterThanOrEqual(0);
        expect(r[i].x + r[i].w).toBeLessThanOrEqual(rw);
        for (let j = i + 1; j < r.length; j++) expect(overlap(r[i], r[j]), `${pool[r[i].i].text} vs ${pool[r[j].i].text}`).toBe(false);
      }
      // never a column: no plate more than two rows above its car
      for (const p of r) expect(pool[p.i].y - (p.y + p.h / 2)).toBeLessThan(2 * (fs + 6) + fs);
    });
  }

  it('the rivals directly ahead and behind keep a plate, even when further away than the rest', () => {
    const pool = bunched(1280, null);
    pool.push(tag(700, 330, 30, 'AHD', true)); // far: under the readable distance
    pool.push(tag(560, 380, 40, 'BHD', true));
    const k = layoutTags(ctx, pool, pool.length, blocks([PICKUP(1280)]), 1, 1280, 720, 11);
    const names = rects(k).map((p) => pool[p.i].text);
    expect(names).toContain('AHD');
    expect(names).toContain('BHD');
    expect(k).toBeLessThanOrEqual(MAX);
    const a = rects(k).findIndex((p) => pool[p.i].text === 'AHD');
    expect(placed[a * 6 + 4], 'a kept plate is readable').toBeGreaterThanOrEqual(0.75);
  });

  it('spread cars keep their plates where they are; a single car gets one plate', () => {
    const pool = [tag(200, 300, 120, 'KAI'), tag(640, 320, 110, 'VEX'), tag(1000, 300, 100, 'CAL')];
    const k = layoutTags(ctx, pool, 3, blocks([]), 0, 1280, 720, 11);
    expect(k).toBe(3);
    for (const p of rects(k)) expect(p.y + p.h / 2).toBeCloseTo(pool[p.i].y, 3);
    expect(layoutTags(ctx, [tag(640, 300, 120, 'RIN')], 1, blocks([]), 0, 1280, 720, 11)).toBe(1);
  });

  it('plates fade in and out over ~150 ms instead of popping', () => {
    const drawn = [];
    const c = {
      ...ctx, font: '', textAlign: '', textBaseline: '', fillStyle: '', globalAlpha: 1,
      fillRect(x, y, w, h) { if (h > 4) drawn.push(this.globalAlpha); }, fillText() {},
    };
    const one = [tag(640, 300, 200, 'FDE')];
    const nb = blocks([]);
    let t = 10000;
    drawTags(c, one, 0, nb, 0, 1280, 720, t); // a frame with no plates: sets the clock
    drawn.length = 0;
    drawTags(c, one, 1, nb, 0, 1280, 720, (t += 16));
    expect(drawn[0]).toBeGreaterThan(0);
    expect(drawn[0]).toBeLessThan(0.2);
    for (let f = 0; f < 12; f++) drawTags(c, one, 1, nb, 0, 1280, 720, (t += 16));
    expect(drawn.at(-1)).toBe(1);
    // gone from the queue: it fades out where it was, and is gone after FADE
    drawn.length = 0;
    drawTags(c, one, 0, nb, 0, 1280, 720, (t += 16));
    expect(drawn[0]).toBeGreaterThan(0.8);
    expect(drawn[0]).toBeLessThan(1);
    for (let f = 0; f < Math.ceil(FADE * 1000 / 16) + 1; f++) drawTags(c, one, 0, nb, 0, 1280, 720, (t += 16));
    drawn.length = 0;
    drawTags(c, one, 0, nb, 0, 1280, 720, (t += 16));
    expect(drawn.length).toBe(0);
  });

  it('allocates nothing per frame: the same pool laid out twice gives the same plates', () => {
    const pool = bunched(1280);
    const k1 = layoutTags(ctx, pool, pool.length, blocks([PICKUP(1280)]), 1, 1280, 720, 11);
    const first = Array.from(placed.slice(0, k1 * 6));
    const k2 = layoutTags(ctx, pool, pool.length, blocks([PICKUP(1280)]), 1, 1280, 720, 11);
    expect(k2).toBe(k1);
    expect(Array.from(placed.slice(0, k2 * 6))).toEqual(first);
    expect(pool.map((p) => p.text)).toEqual(NAMES);
  });
});
