// Photo-finish margin (ticket 0276): one line on the results card when the gap is under 1 s.
import { describe, it, expect } from 'vitest';
import { finishMargin, marginText } from '../../src/racecall.js';

describe('finishMargin', () => {
  it('won: nearest finisher is behind', () => {
    expect(finishMargin([60.0, 60.21, 65], 0)).toEqual({ kind: 'won', gap: expect.closeTo(0.21, 6) });
  });
  it('lost: nearest finisher is ahead', () => {
    expect(finishMargin([59.79, 60.0, 64], 1)).toEqual({ kind: 'lost', gap: expect.closeTo(0.21, 6) });
  });
  it('picks the nearest of ahead and behind; equal gaps count as lost', () => {
    expect(finishMargin([59.5, 60, 60.1], 1)).toMatchObject({ kind: 'won' });
    expect(finishMargin([59.9, 60, 60.3], 1)).toMatchObject({ kind: 'lost' });
    expect(finishMargin([59.8, 60, 60.2], 1)).toMatchObject({ kind: 'lost' });
  });
  it('tie: identical times are a dead heat', () => {
    expect(finishMargin([60, 60, 70], 0)).toEqual({ kind: 'tie', gap: 0 });
  });
  it('null when the player did not finish (DNF)', () => {
    expect(finishMargin([60, null, 60.5], 1)).toBeNull();
    expect(finishMargin([60, undefined], 1)).toBeNull();
    expect(finishMargin([60], 3)).toBeNull();
  });
  it('null when nobody else finished', () => {
    expect(finishMargin([60, null, null], 0)).toBeNull();
    expect(finishMargin([60], 0)).toBeNull();
  });
  it('null at a gap of exactly 1.0 s or more', () => {
    expect(finishMargin([60, 61], 0)).toBeNull();
    expect(finishMargin([59, 60], 1)).toBeNull();
    expect(finishMargin([60, 63], 0)).toBeNull();
    expect(finishMargin([60, 60.999], 0)).toMatchObject({ kind: 'won' });
  });
  it('ignores non-finite times', () => {
    expect(finishMargin([60, NaN, Infinity, 60.4], 0)).toMatchObject({ kind: 'won' });
  });
});

describe('marginText', () => {
  it('words won / lost with two decimals', () => {
    expect(marginText({ kind: 'won', gap: 0.214 })).toBe('PHOTO FINISH · WON BY 0.21s');
    expect(marginText({ kind: 'lost', gap: 0.5 })).toBe('PHOTO FINISH · LOST BY 0.50s');
  });
  it('a dead heat, and never "BY 0.00s" for a real gap', () => {
    expect(marginText({ kind: 'tie', gap: 0 })).toBe('PHOTO FINISH · DEAD HEAT');
    expect(marginText({ kind: 'won', gap: 0.001 })).toBe('PHOTO FINISH · WON BY 0.01s');
  });
  it('empty for no margin', () => {
    expect(marginText(null)).toBe('');
  });
});
