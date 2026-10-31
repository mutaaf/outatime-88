// Ticket 0231: a resumed solo race counts 3 → 2 → 1 over 0.9 s, then lets the sim run again.
import { describe, it, expect } from 'vitest';
import { createResumeBeat, RESUME_BEATS, RESUME_BEAT_S } from '../../src/resume-beat.js';

/** The numbers seen frame by frame (60 fps) until the beat ends. */
function play(beat, frame = 1 / 60, max = 600) {
  const seen = [];
  let frames = 0;
  for (let b = beat.tick(0); b.active && frames < max; b = beat.tick(frame), frames++) {
    if (seen[seen.length - 1] !== b.n) seen.push(b.n);
  }
  return { seen, seconds: frames * frame };
}

describe('createResumeBeat', () => {
  it('is idle until started', () => {
    expect(createResumeBeat().tick(0.016)).toEqual({ active: false, n: 0 });
  });

  it('shows 3, 2, 1 over ~0.9 s, then goes inactive', () => {
    const beat = createResumeBeat();
    beat.start();
    const { seen, seconds } = play(beat);
    expect(seen).toEqual([3, 2, 1]);
    expect(seconds).toBeGreaterThan(RESUME_BEATS * RESUME_BEAT_S - 0.02);
    expect(seconds).toBeLessThan(RESUME_BEATS * RESUME_BEAT_S + 0.02);
    expect(beat.tick(0.016)).toEqual({ active: false, n: 0 });
  });

  it('a second start() restarts from 3', () => {
    const beat = createResumeBeat();
    beat.start();
    for (let i = 0; i < 30; i++) beat.tick(1 / 60); // halfway through "2"
    expect(beat.tick(0).n).toBe(2);
    beat.start();
    expect(play(beat).seen).toEqual([3, 2, 1]);
  });

  it('stop() ends it at once', () => {
    const beat = createResumeBeat();
    beat.start();
    beat.tick(0.1);
    beat.stop();
    expect(beat.tick(0.016).active).toBe(false);
  });

  it('ignores non-finite or negative frame seconds', () => {
    const beat = createResumeBeat();
    beat.start();
    for (const bad of [NaN, Infinity, -Infinity, -1, undefined]) expect(beat.tick(bad)).toEqual({ active: true, n: 3 });
  });

  it('one long frame never skips the numbers', () => {
    const beat = createResumeBeat();
    beat.start();
    expect(beat.tick(5).n).toBe(3);
    expect(play(beat, 0.1).seen).toEqual([3, 2, 1]);
  });

  it('reuses one result object (no per-frame allocation)', () => {
    const beat = createResumeBeat();
    beat.start();
    expect(beat.tick(0.01)).toBe(beat.tick(0.01));
  });
});
