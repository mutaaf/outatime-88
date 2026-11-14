// Ticket 0271: pad START pauses and resumes, A resumes; fresh presses only.
import { describe, it, expect } from 'vitest';
import { createPadMenu, padEdges, padPauseStep, readPad } from '../../src/pad-pause.js';

/** Runs frames of [status, { start, a }] and returns the frames (0-based) that pressed Escape. */
function run(frames, mem = createPadMenu()) {
  const hits = [];
  frames.forEach(([status, gp], i) => { padPauseStep(status, () => gp, mem, (start) => hits.push(start ? i : `A${i}`)); });
  return hits;
}
const up = { start: false, a: false }, S = { start: true, a: false }, A = { start: false, a: true }, SA = { start: true, a: true };

describe('padEdges', () => {
  it('fires once per press, never while held, and again after a release', () => {
    const mem = { start: false, a: false };
    const edges = [false, true, true, true, false, true, false].map((start) => padEdges({ start, a: false }, mem).startEdge);
    expect(edges).toEqual([false, true, false, false, false, true, false]);
  });

  it('no pad never fires; returns the memory it was given', () => {
    const mem = { start: false, a: false };
    expect(padEdges(null, mem)).toMatchObject({ startEdge: false, aEdge: false });
    expect(padEdges(S, mem)).toBe(mem);
  });
});

const btn = (pressed) => ({ pressed, value: pressed ? 1 : 0 });
const pad = (pressed, connected = true) => ({ connected, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(pressed.includes(i))) });

describe('readPad', () => {
  it('reads START (9) and A (0) off any connected pad; RT alone is not A', () => {
    expect({ ...readPad([pad([9])]) }).toEqual({ start: true, a: false });
    expect({ ...readPad([pad([0])]) }).toEqual({ start: false, a: true });
    expect({ ...readPad([pad([7])]) }).toEqual({ start: false, a: false });
    expect({ ...readPad([null, pad([9], false), pad([0])]) }).toEqual({ start: false, a: true });
    expect({ ...readPad([pad([]), pad([9])]) }).toEqual({ start: true, a: false }); // a second pad's START counts (as on the title)
  });

  it('nothing held with no pads, no API, or the paired TV phone driving', () => {
    expect({ ...readPad(null) }).toEqual({ start: false, a: false });
    expect({ ...readPad([null, null]) }).toEqual({ start: false, a: false });
    expect({ ...readPad([pad([9, 0])], true) }).toEqual({ start: false, a: false });
  });

  it('reuses one object (no per-frame allocation)', () => {
    expect(readPad([pad([9])])).toBe(readPad([]));
  });
});

describe('padPauseStep', () => {
  it('START pauses while racing and resumes while paused, once per press', () => {
    expect(run([['PLAYING', up], ['PLAYING', S], ['PAUSED', S], ['PAUSED', S], ['PAUSED', up], ['PAUSED', S], ['PLAYING', S], ['PLAYING', up]])).toEqual([1, 5]);
  });

  it('the START that started the race from the title must be let go first', () => {
    expect(run([['TITLE', S], ['PLAYING', S], ['PLAYING', S], ['PLAYING', up], ['PLAYING', S]])).toEqual([4]);
    expect(run([['PLAYING', S]])).toEqual([]); // tracking starts with both held
  });

  it('A only resumes a paused race, and the gas held into the pause is not a press', () => {
    expect(run([['PLAYING', up], ['PLAYING', A], ['PLAYING', up], ['PLAYING', A]])).toEqual([]); // A racing = gas
    expect(run([['PLAYING', up], ['PLAYING', A], ['PLAYING', SA], ['PAUSED', A], ['PAUSED', A], ['PAUSED', up], ['PAUSED', A]])).toEqual([2, 'A6']);
  });

  it('never reads the pad outside a race, and forgets presses there', () => {
    const mem = createPadMenu();
    let polled = 0;
    for (const st of ['TITLE', 'GRID', 'GAMEOVER', 'LIVE_DONE']) padPauseStep(st, () => { polled++; return S; }, mem, () => { throw new Error('pressed'); });
    expect(polled).toBe(0);
    expect(mem).toMatchObject({ start: true, a: true });
  });
});
