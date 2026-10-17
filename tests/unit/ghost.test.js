import { describe, it, expect } from 'vitest';
import { createGhostRecorder, createGhostRace, ghostFinishTime, ghostGap } from '../../src/ghost.js';
import { decodeGhost } from '../../src/ghost-codec.js';

describe('ghost recorder', () => {
  it('samples on a 5 Hz grid however the sim steps, and skips tiny runs', () => {
    const rec = createGhostRecorder();
    for (let i = 0; i <= 480; i++) rec.sample(i / 120, (i / 120) * 40, 0);
    expect(rec.count).toBe(20);
    expect(rec.encode()).toBeUndefined(); // < 5 s isn't worth racing
    for (let i = 481; i <= 3600; i++) rec.sample(i / 120, (i / 120) * 40, 0.3);
    const g = decodeGhost(rec.encode());
    expect(g.d.length).toBe(150);
    expect(g.d[149]).toBeCloseTo(1200, -1);
    rec.reset();
    expect(rec.count).toBe(0);
  });
});

describe('ghost race', () => {
  const rec = createGhostRecorder();
  for (let i = 0; i <= 3600; i++) rec.sample(i / 60, (i / 60) * 100, 0); // 100 units/s
  const data = { initials: 'BIF', score: 1, trace: rec.encode() };

  it('knows when the ghost crossed the line', () => {
    expect(ghostFinishTime(decodeGhost(data.trace), 5200)).toBeCloseTo(52, 1);
    expect(ghostFinishTime(decodeGhost(data.trace), 99999)).toBeNull();
  });
  it('gives a signed time gap at your speed', () => {
    expect(ghostGap(1100, 1000, 100)).toBe(1);
    expect(ghostGap(900, 1000, 100)).toBe(-1);
    expect(ghostGap(900, 1000, 0)).toBeCloseTo(-3.33, 2); // floors speed at 30
  });
  it('calls the result at the line', () => {
    const race = createGhostRace({ getElementById: () => null });
    expect(race.load(data, 5200)).toBe(true);
    expect(race.initials).toBe('BIF');
    expect(race.verdict(50)).toEqual({ beat: true, by: expect.closeTo(2, 1) });
    expect(race.verdict(55).beat).toBe(false);
    expect(race.verdict(null)).toBeNull();
    expect(race.load({ trace: 'junk!' }, 5200)).toBe(false);
    expect(race.active).toBe(false);
  });
});
