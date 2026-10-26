// A fast near-miss chain shows one growing tally, not a stack of plates (ticket 0205): chain
// events fold into the live chain plate, pickups keep their own, and at most two plates show.
import { describe, it, expect } from 'vitest';
import { foldChain, startChain, chainLabel } from '../../src/chain-plate.js';
import { LABEL, layoutLabels, fallbackBox, labelSlots } from '../../src/popups.js';

const measure = (s) => s.length * 8;
const plate = (label, life = 0.65) => ({ label, life, maxLife: 0.65 });

/** The race step's chain path: fold into the live plate or spawn a new one. */
let streak = 0;
function chainEvent(list, reason, pts, combo, chain, crashed = false) {
  streak = crashed ? 2 : streak + 2;
  const sw = foldChain(list, pts, combo, streak);
  const label = chainLabel(reason, sw ? sw.total : pts, combo, chain);
  if (sw) { sw.label = label; return sw; }
  const e = plate(label);
  list.push(e);
  return startChain(e, pts, combo, streak);
}

const age = (list, dt) => { for (let i = list.length - 1; i >= 0; i--) { list[i].life -= dt; if (list[i].life <= 0) list.splice(i, 1); } };

describe('chain plate', () => {
  it('three near-misses inside the window leave one chain plate with the running total and multiplier', () => {
    const list = [];
    chainEvent(list, '⚡ CLOSE SHAVE!', 1200, 4, 2);
    age(list, 0.2);
    chainEvent(list, '⚡ CLOSE SHAVE!', 1500, 5, 3);
    age(list, 0.2);
    chainEvent(list, '🌲 TREE-GRAZE BOOST!', 1800, 6, 4);
    expect(list.length).toBe(1);
    expect(list[0].total).toBe(4500);
    expect(list[0].label).toBe('🌲 TREE-GRAZE BOOST! +4500 (x6) · NEAR-MISS x4');
    expect(list[0].life).toBe(list[0].maxLife); // refreshed
    expect(list[0].merged).toBe(true);
  });

  it('a pickup keeps its own plate, and the chain plate moves nearest the car when it grows', () => {
    const list = [];
    chainEvent(list, '⚡ CLOSE SHAVE!', 1200, 4, 2);
    list.push(plate('+120 🔥 x4'));
    chainEvent(list, '⚡ CLOSE SHAVE!', 1500, 5, 3);
    expect(list.map((e) => !!e.chain)).toEqual([false, true]);
    expect(list[0].label).toBe('+120 🔥 x4');
    const out = labelSlots();
    const box = fallbackBox(390, 844, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const n = layoutLabels(list, box, 390, 844, measure, out, false);
    expect(n).toBe(2);
    expect(out[5]).toBe(1); // nearest the car: the chain plate
  });

  it('a plate that has gone starts a new tally, and so does a crash that dropped the multiplier', () => {
    const list = [];
    chainEvent(list, 'A', 1000, 4, 2);
    age(list, 0.7);
    chainEvent(list, 'B', 600, 5, 3);
    expect(list.length).toBe(1);
    expect(list[0].total).toBe(600);
    chainEvent(list, 'C', 500, 1, 1, true); // a hit in between reset the streak
    expect(list.length).toBe(1);
    expect(list[0].total).toBe(500);
    expect(list[0].label).toBe('C +500 (x1)');
  });

  it('a crash at x2 starts a new tally even though the multiplier is back to x2', () => {
    const list = [];
    chainEvent(list, 'A', 1000, 2, 1);
    chainEvent(list, 'B', 1000, 2, 2, true); // crash (streak 0), then a graze takes it to 2 again
    expect(list.length).toBe(1);
    expect(list[0].total).toBe(1000);
  });

  it('never shows more than two plates, and the chain plate is never pushed off by pickups', () => {
    expect(LABEL.max).toBe(2);
    const list = [];
    chainEvent(list, '⚡ CLOSE SHAVE!', 1200, 4, 2);
    list.push(plate('+25 💚 HP REPAIRED!'), plate('+120 🔥 x4'), plate('💨 NOS REFILL!'));
    const out = labelSlots();
    for (const [rw, rh] of [[390, 844], [1280, 720], [260, 563]]) {
      const box = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
      const n = layoutLabels(list, box, rw, rh, measure, out, false);
      expect(n).toBe(2);
      const shown = [out[5], out[LABEL.stride + 5]];
      expect(shown).toContain(0); // the chain plate
      expect(shown).toContain(3); // the newest pickup
    }
  });

  it('a grown plate pops, inside the buffer and clear of the car; reduced motion only updates the numbers', () => {
    const list = [];
    chainEvent(list, '⚡ CLOSE SHAVE!', 1200, 4, 2);
    chainEvent(list, '⚡ CLOSE SHAVE!', 1500, 5, 3);
    const out = labelSlots();
    const c = 1 - 1 / LABEL.fovMax;
    for (const [rw, rh] of [[390, 844], [1280, 720], [240, 520]]) {
      const box = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
      layoutLabels(list, box, rw, rh, measure, out, false);
      const popped = out[6], w = out[2];
      const r = { x0: out[0], y0: out[1], x1: out[0] + out[2], y1: out[1] + out[3] };
      expect(r.x0 >= rw * c * 0.5 && r.x1 <= rw * (1 - c * 0.5) && r.y0 >= rh * c * 0.46).toBe(true);
      expect(r.y1 <= box.y0 || r.x1 <= box.x0 || r.x0 >= box.x1).toBe(true);
      layoutLabels(list, box, rw, rh, measure, out, true);
      const still = out[6];
      expect(still).toBeLessThanOrEqual(1);
      if (rw >= 390) { expect(popped).toBeGreaterThan(1); expect(out[6]).toBe(1); expect(w).toBeGreaterThan(out[2]); }
    }
    list[0].life = list[0].maxLife - 0.3; // the pop is over: back to size
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    layoutLabels(list, box, 1280, 720, measure, out, false);
    expect(out[6]).toBe(1);
  });
});
