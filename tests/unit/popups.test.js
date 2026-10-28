// Floating pickup / score labels (ticket 0114): the layout keeps every label clear of the car,
// of each other and inside the canvas, whatever is spawned and wherever the car is.
import { describe, it, expect } from 'vitest';
import { LABEL, layoutLabels, fallbackBox, labelSlots } from '../../src/popups.js';

const measure = (s) => s.length * 8; // a wide-ish bold font: 8 px per character

function wave(labels, ages, maxLife = 0.65) {
  return labels.map((label, i) => ({ label, life: maxLife - (ages[i] || 0), maxLife }));
}

function rects(out, n) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const o = i * LABEL.stride;
    r.push({ x0: out[o], y0: out[o + 1], x1: out[o] + out[o + 2], y1: out[o + 1] + out[o + 3], a: out[o + 4] });
  }
  return r;
}

const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// Inside what reaches the screen at the deepest FOV crop (main.js blit at full speed + NOS).
const inside = (r, rw, rh) => {
  const c = 1 - 1 / LABEL.fovMax;
  return r.x0 >= rw * c * 0.5 && r.y0 >= rh * c * 0.46 && r.x1 <= rw * (1 - c * 0.5) && r.y1 <= rh * (1 - c * 0.54);
};

// Buffer sizes the 2D road draws at (viewW / pixelScale): phone and desktop, sharp and chunky.
const SIZES = [[390, 844], [260, 563], [1280, 720], [640, 360], [240, 520]];
const LABELS = ['+25 💚 HP REPAIRED!', '+120 🔥 x4', '🎯 NEAR MISS +250 (x12) CHAIN x3', '💨 NOS REFILL!', '+88 ⚡ 1.88GW!'];

describe('layoutLabels', () => {
  it('never puts a label on the car, for cars across the road and in the air', () => {
    const out = labelSlots();
    for (const [rw, rh] of SIZES) {
      const base = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
      const w = base.x1 - base.x0, h = base.y1 - base.y0;
      for (const cx of [w / 2, rw * 0.2, rw * 0.5, rw * 0.8, rw - w / 2]) {
        for (const lift of [0, rh * 0.15, rh * 0.3, base.y0 - 4]) {
          const box = { x0: cx - w / 2, x1: cx + w / 2, y0: base.y0 - lift, y1: base.y0 - lift + h };
          const n = layoutLabels(wave(LABELS.slice(0, 3), [0.05, 0.15, 0.3]), box, rw, rh, measure, out);
          expect(n).toBeGreaterThan(0);
          for (const r of rects(out, n)) {
            expect(hit(r, box), `${rw}x${rh} car@${cx},${box.y0}`).toBe(false);
            expect(inside(r, rw, rh), `${rw}x${rh} car@${cx},${box.y0}`).toBe(true);
          }
        }
      }
    }
  });

  it('sits above the roofline when there is room', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const n = layoutLabels(wave(['+25 💚 HP REPAIRED!'], [0.1]), box, 1280, 720, measure, out);
    const [r] = rects(out, n);
    expect(r.y1).toBeLessThanOrEqual(box.y0);
    expect((r.x0 + r.x1) / 2).toBeCloseTo((box.x0 + box.x1) / 2, 0);
  });

  it('two labels spawned within 300 ms never overlap, at any point of their life', () => {
    const out = labelSlots();
    for (const [rw, rh] of SIZES) {
      const box = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
      for (let gap = 0; gap <= 0.3; gap += 0.05) {
        for (let age = 0; age < 0.65 - gap; age += 0.04) {
          // The older one is a 0.7 s obstacle label, the newer a 0.65 s pickup label.
          const list = [{ label: LABELS[2], life: 0.7 - age - gap, maxLife: 0.7 }, { label: LABELS[0], life: 0.65 - age, maxLife: 0.65 }];
          const n = layoutLabels(list, box, rw, rh, measure, out);
          const r = rects(out, n);
          expect(n).toBe(2);
          expect(hit(r[0], r[1]), `${rw}x${rh} gap ${gap} age ${age}`).toBe(false);
        }
      }
    }
  });

  it('shows at most LABEL.max labels; a newer one stacks above the live one (0220)', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const list = wave(LABELS, [0.4, 0.3, 0.2, 0.1, 0]);
    const n = layoutLabels(list, box, 1280, 720, measure, out);
    expect(n).toBe(LABEL.max);
    const shown = [out[5], out[LABEL.stride + 5]].sort();
    expect(shown).toEqual([3, 4]); // the two newest
    const r = rects(out, n);
    expect(out[5]).toBe(3); // the older of the two is nearest the car, the newer above it
    expect(r[0].y0).toBeGreaterThan(r[1].y0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(hit(r[i], r[j])).toBe(false);
  });

  // Ticket 0220: one hit-text lane. A label keeps the slot it landed in, a hit outranks a pickup.
  const yOf = (out, n, src) => { for (let i = 0; i < n; i++) if (out[i * LABEL.stride + 5] === src) return out[i * LABEL.stride + 1]; return null; };

  it('a live label keeps its place when a new one lands, at both viewports', () => {
    const out = labelSlots();
    for (const [rw, rh] of [[390, 844], [1280, 720]]) {
      const box = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
      const impact = { label: '💥 SOLID TRAFFIC IMPACT!', hit: true, life: 0.6, maxLife: 0.7 };
      const list = [impact];
      expect(layoutLabels(list, box, rw, rh, measure, out)).toBe(1);
      const before = out[1];
      list.push({ label: '+15 💚 HP REPAIRED!', life: 0.65, maxLife: 0.65 });
      const n = layoutLabels(list, box, rw, rh, measure, out);
      expect(n).toBe(2);
      expect(yOf(out, n, 0), `${rw}x${rh}`).toBe(before);
      const r = rects(out, n);
      const imp = r[out[5] === 0 ? 0 : 1], pick = r[out[5] === 0 ? 1 : 0];
      expect(pick.y1).toBeLessThanOrEqual(imp.y0); // one plate-height above, never on it
      // The impact goes first: the wrench label stays put above it, it doesn't drop onto the car.
      list.shift();
      const above = pick.y0;
      expect(layoutLabels(list, box, rw, rh, measure, out)).toBe(1);
      // (It only loses the nudge it took from the impact's float, never a whole plate.)
      expect(Math.abs(out[1] - above)).toBeLessThanOrEqual(LABEL.rise);
      expect(out[1] + out[3]).toBeLessThan(box.y0 - LABEL.font - LABEL.padY * 2);
      // A label that lands now takes the free slot nearest the car, under the wrench label.
      list.push({ label: '+120 🔥 x4', life: 0.65, maxLife: 0.65 });
      const m = layoutLabels(list, box, rw, rh, measure, out);
      expect(m).toBe(2);
      expect(yOf(out, m, 1)).toBeGreaterThan(yOf(out, m, 0));
    }
  });

  it('an impact outranks a pickup plate when the lane is full', () => {
    const out = labelSlots();
    const box = fallbackBox(390, 844, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const list = [
      { label: '⚡ CLOSE SHAVE! +500 (x2)', chain: true, life: 0.6, maxLife: 0.65 },
      { label: '💥 SOLID TRAFFIC IMPACT!', hit: true, life: 0.6, maxLife: 0.7 },
      { label: '+15 💚 HP REPAIRED!', life: 0.65, maxLife: 0.65 },
    ];
    const n = layoutLabels(list, box, 390, 844, measure, out);
    expect(n).toBe(2);
    expect([out[5], out[LABEL.stride + 5]].sort()).toEqual([0, 1]);
    // Without the chain both fit; with a newer impact the pickup is the one dropped.
    const two = [{ label: '+15 💚 HP REPAIRED!', life: 0.6, maxLife: 0.65 }, { label: '+120 🔥 x4', life: 0.62, maxLife: 0.65 }];
    two.push({ label: '💥 TAKEDOWN! +2000', hit: true, life: 0.7, maxLife: 0.7 });
    const m = layoutLabels(two, box, 390, 844, measure, out);
    expect(m).toBe(2);
    expect([out[5], out[LABEL.stride + 5]].sort()).toEqual([1, 2]); // the oldest pickup is replaced
  });

  it('a label pushed out of the lane never comes back half-faded', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const list = [
      { label: '💥 SOLID TRAFFIC IMPACT!', hit: true, life: 0.5, maxLife: 0.7 },
      { label: '💥 TAKEDOWN! +2000', hit: true, life: 0.6, maxLife: 0.7 },
      { label: '+15 💚 HP REPAIRED!', life: 0.65, maxLife: 0.65 },
    ];
    expect(layoutLabels(list, box, 1280, 720, measure, out)).toBe(2);
    expect([out[5], out[LABEL.stride + 5]].sort()).toEqual([0, 1]);
    list.shift(); // the first impact ends; the wrench label had lost its place
    const n = layoutLabels(list, box, 1280, 720, measure, out);
    expect(n).toBe(1);
    expect(list[out[5]].label).toBe('💥 TAKEDOWN! +2000');
  });

  it('shrinks a label wider than a narrow buffer so it fits whole', () => {
    const out = labelSlots();
    const box = fallbackBox(240, 520, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const long = '🎯 NEAR MISS +250 (x12) CHAIN x3 · TAKEDOWN';
    const n = layoutLabels(wave([long], [0.1]), box, 240, 520, measure, out);
    const [r] = rects(out, n);
    expect(inside(r, 240, 520)).toBe(true);
    expect(out[6]).toBeLessThan(1);
  });

  it('skips entries without a label and fades labels out at the end', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const list = [{ label: '', life: 0.5, maxLife: 0.65 }, { label: 'X', life: 0.01, maxLife: 0.65 }, { life: 0.5, maxLife: 0.7 }];
    const n = layoutLabels(list, box, 1280, 720, measure, out);
    expect(n).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[4]).toBeLessThan(0.1);
  });

  it('reduced motion: labels hold still', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const ys = [0.05, 0.3, 0.6].map((age) => { layoutLabels(wave(['X'], [age]), box, 1280, 720, measure, out, true); return out[1]; });
    expect(new Set(ys).size).toBe(1);
    layoutLabels(wave(['X'], [0.6]), box, 1280, 720, measure, out, false);
    expect(out[1]).toBeLessThan(ys[0]);
  });

  it('measures each label once (cached on the entry)', () => {
    const out = labelSlots();
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    let calls = 0;
    const m = (s) => { calls++; return measure(s); };
    const list = wave(LABELS.slice(0, 2), [0, 0.1]);
    for (let f = 0; f < 30; f++) layoutLabels(list, box, 1280, 720, m, out);
    expect(calls).toBe(2);
  });
});
