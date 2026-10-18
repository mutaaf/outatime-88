// Orange-track set pieces (sprint 4): the track's guarantees, deterministic.
import { describe, it, expect } from 'vitest';
import { stepSetPieces, viewRoll, progressIn, makeFeature, loopLength, SETPIECE } from '../../src/setpieces.js';

const car = (o = {}) => ({ speed: 60, playerY: 0, setPieceId: 0, ...o });

describe('set pieces', () => {
  it('a booster gate kicks you up to loop speed, once', () => {
    const gate = makeFeature('BOOSTER', 1000, 2400, { minMph: SETPIECE.LOOP.minMph });
    const s = car({ speed: 40 });
    expect(stepSetPieces(s, gate, 1100)).toBe('BOOST');
    expect(s.speed).toBeGreaterThanOrEqual(40 + SETPIECE.BOOSTER.kickMph);
    const after = s.speed;
    expect(stepSetPieces(s, gate, 1300)).toBeNull();
    expect(s.speed).toBe(after);
    const fast = car({ speed: 120 });
    stepSetPieces(fast, gate, 1100);
    expect(fast.speed).toBe(120); // never slows you down
  });

  it('entering a loop too slow drops you off the top (once); fast enough goes round', () => {
    const loop = makeFeature('LOOP', 0, loopLength(), { minMph: 55 });
    const slow = car({ speed: 40 });
    const events = [];
    for (let z = 0; z <= loop.length; z += 200) events.push(stepSetPieces(slow, loop, z));
    expect(events.filter((e) => e === 'LOOP_FAIL').length).toBe(1);
    const fast = car({ speed: 80 });
    for (let z = 0; z <= loop.length; z += 200) expect(stepSetPieces(fast, loop, z)).toBeNull();
  });

  it('touching down in a gap is a (time-only) fall; flying over it is not', () => {
    const gap = makeFeature('GAP', 0, 1000);
    expect(stepSetPieces(car({ playerY: 0 }), gap, 300)).toBe('GAP_FALL');
    expect(stepSetPieces(car({ playerY: 140 }), gap, 300)).toBeNull();
  });

  it('views: a full barrel roll through a corkscrew, a lean on a half-pipe, gentle in calm mode', () => {
    const ck = makeFeature('CORKSCREW', 0, 7200, { dir: -1 });
    expect(viewRoll(ck, 3600, false)).toBeCloseTo(-Math.PI, 6);
    expect(Math.abs(viewRoll(ck, 3600, true))).toBeLessThan(0.2);
    const wr = makeFeature('WALLRIDE', 0, 9600, { dir: 1 });
    expect(viewRoll(wr, 4800, false)).toBeCloseTo(0.5, 6);
    expect(viewRoll(null, 0, false)).toBe(0);
    expect(progressIn(wr, -5)).toBe(0);
    expect(progressIn(wr, 99999)).toBe(1);
  });

  it('is deterministic: the same inputs give the same run, every time', () => {
    const run = () => {
      const fs = [makeFeature('BOOSTER', 0, 2400, { minMph: 55 }), makeFeature('LOOP', 2400, loopLength(), { minMph: 55 }), makeFeature('GAP', 12000, 1000)];
      const s = car({ speed: 44 });
      const log = [];
      for (let z = 0; z < 14000; z += 120) {
        const f = fs.find((x) => z >= x.z0 && z < x.z0 + x.length) || null;
        log.push(stepSetPieces(s, f, z), Math.round(s.speed * 1000));
        s.speed = Math.max(20, s.speed - 0.05);
      }
      return log.join(',');
    };
    expect(run()).toBe(run());
  });
});
