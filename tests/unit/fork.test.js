import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { forkLean, forkCueState } from '../../src/fork.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const label = (id) => html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))[1].trim();

describe('fork cue (0019)', () => {
  it('labels are a word each plus arrows, never a banner sentence', () => {
    for (const id of ['forkLeftCard', 'forkRightCard']) {
      const text = label(id);
      expect(text.split(/\s+/).filter((w) => /[A-Z]/.test(w)).length).toBeLessThanOrEqual(2);
      expect(text.length).toBeLessThanOrEqual(14);
    }
    expect(label('forkLeftCard').startsWith('◀')).toBe(true);
    expect(label('forkRightCard').endsWith('▶')).toBe(true);
  });
  it('leans the way the outcome will go', () => {
    expect(forkLean(-0.01)).toBe('LEFT');
    expect(forkLean(0)).toBe('RIGHT');
    expect(forkLean(0.5)).toBe('RIGHT');
  });
  it('is OFF away from a fork', () => {
    expect(forkCueState(false, -0.4)).toBe('OFF');
    expect(forkCueState(true, -0.4)).toBe('LEFT');
    expect(forkCueState(true, 0.4)).toBe('RIGHT');
  });
});

// Ticket 0242: the cue's two cards, as shares of the view, for the boards behind them to read.
import { forkCueBox, cueCovers } from '../../src/board-fade.js';

describe('fork cue box (0242)', () => {
  const view = { left: 0, top: 0, width: 1000, height: 500 };
  it('writes each card as view fractions, padded for the lean scale', () => {
    const box = { n: 0, r: new Float32Array(8) };
    forkCueBox(box, [{ cx: 400, cy: 100, w: 100, h: 20 }, { cx: 600, cy: 100, w: 80, h: 20 }], view);
    expect(box.n).toBe(2);
    // unscaled 350..450 × 90..110, grown to the lean's 1.06 scale plus a 4 px margin
    expect(box.r[0]).toBeCloseTo((400 - 53 - 4) / 1000, 5);
    expect(box.r[1]).toBeCloseTo((100 - 10.6 - 4) / 500, 5);
    expect(box.r[2]).toBeCloseTo((400 + 53 + 4) / 1000, 5);
    expect(box.r[3]).toBeCloseTo((100 + 10.6 + 4) / 500, 5);
    expect(box.r[4]).toBeLessThan(box.r[6]);
  });
  it('counts only cards that are laid out, relative to the view origin', () => {
    const box = { n: 0, r: new Float32Array(8) };
    forkCueBox(box, [{ cx: 0, cy: 0, w: 0, h: 0 }, { cx: 150, cy: 60, w: 100, h: 20 }], { left: 50, top: 10, width: 200, height: 100 });
    expect(box.n).toBe(1);
    expect(box.r[0]).toBeCloseTo((150 - 50 - 53 - 4) / 200, 5);
    expect(box.r[1]).toBeCloseTo((60 - 10 - 10.6 - 4) / 100, 5);
  });
});

describe('a board behind the fork cue (0242)', () => {
  // One card across the middle of a 400 × 200 road buffer: x 0.4..0.6, y 0.3..0.4.
  const box = { n: 1, r: Float32Array.of(0.4, 0.3, 0.6, 0.4, 0, 0, 0, 0) };
  it('is covered when its face overlaps a card on the road buffer', () => {
    expect(cueCovers(box, 150, 50, 170, 65, 400, 200, 1)).toBe(true);  // overlaps the card's left edge
    expect(cueCovers(box, 230, 75, 300, 90, 400, 200, 1)).toBe(true);  // its right edge, lower down
  });
  it('is not covered beside, above or below the card, or with no cue up', () => {
    expect(cueCovers(box, 100, 50, 155, 70, 400, 200, 1)).toBe(false); // ends left of x = 160
    expect(cueCovers(box, 150, 20, 250, 58, 400, 200, 1)).toBe(false); // ends above y = 60
    expect(cueCovers(box, 150, 82, 250, 120, 400, 200, 1)).toBe(false); // starts below y = 80
    expect(cueCovers({ n: 0, r: box.r }, 150, 50, 250, 90, 400, 200, 1)).toBe(false);
    expect(cueCovers(null, 150, 50, 250, 90, 400, 200, 1)).toBe(false);
  });
  it('follows the FOV push-in: the view shows the buffer middle, scaled up', () => {
    // crop 1.25: the view shows x 40..360 and y 18.4..178.4 of the buffer; the card is at
    // x 40 + 0.4·320 = 168 .. 232 and y 18.4 + 0.3·160 = 66.4 .. 82.4
    expect(cueCovers(box, 150, 50, 165, 90, 400, 200, 1.25)).toBe(false);
    expect(cueCovers(box, 150, 50, 170, 90, 400, 200, 1.25)).toBe(true);
    expect(cueCovers(box, 150, 83, 250, 120, 400, 200, 1.25)).toBe(false);
  });
});
