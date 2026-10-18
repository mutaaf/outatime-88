// Orange-track set pieces (sprint 4): the track's guarantees, deterministic.
import { describe, it, expect } from 'vitest';
import { stepSetPieces, viewRoll, progressIn, makeFeature, loopLength, loopEntryMph, SETPIECE } from '../../src/setpieces.js';
import { loopStep } from '../../src/handling.js';

const car = (o = {}) => ({ speed: 60, playerY: 0, setPieceId: 0, ...o });

describe('set pieces', () => {
  it('a booster gate tops you up to its speed, once, and never slows you down', () => {
    const gate = makeFeature('BOOSTER', 1000, 2400, { boostTo: 74 });
    const s = car({ speed: 40 });
    expect(stepSetPieces(s, gate, 1100)).toBe('BOOST');
    expect(s.speed).toBe(74);
    s.speed = 70;
    expect(stepSetPieces(s, gate, 1300)).toBeNull();
    expect(s.speed).toBe(70);
    const fast = car({ speed: 120 });
    stepSetPieces(fast, gate, 1100);
    expect(fast.speed).toBe(120);
  });

  it("a gate's speed clears the loop over the top under the real loop physics, even on the slowest pace", () => {
    const loop = makeFeature('LOOP', 0, Math.round(loopLength() / 200) * 200, { minMph: SETPIECE.LOOP.minMph });
    for (const k of [40, 57.5, 81.25]) { // SMOOTH, ARCADE, TURBO: sim Z per mph·s
      let v = loopEntryMph(), z = 0, peeled = false;
      const dt = 1 / 120;
      while (z < loop.length) {
        const r = loopStep(v, loop, z / loop.length, dt);
        if (r.peel) { peeled = true; break; }
        v += r.dv;
        z += v * k * dt;
      }
      expect(peeled, `pace ${k}`).toBe(false);
    }
    // …and 10 mph less would not, on the slowest pace: the gate is doing real work.
    let v = loopEntryMph() - 12, z = 0, peeled = false;
    while (z < loop.length && !peeled) { const r = loopStep(v, loop, z / loop.length, 1 / 120); peeled = r.peel; v += r.dv; z += v * 40 / 120; }
    expect(peeled).toBe(true);
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
      const fs = [makeFeature('BOOSTER', 0, 2400, { boostTo: 74 }), makeFeature('LOOP', 2400, loopLength(), { minMph: 40 }), makeFeature('GAP', 12000, 1000)];
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
