import { describe, it, expect } from 'vitest';
import { createRaceClock, runCapFor, RACE } from '../../src/race.js';

describe('race clock', () => {
  it('time bonuses shrink geometrically, so their total converges', () => {
    const c = createRaceClock({ levelIndex: 0 });
    const grants = [];
    for (let i = 0; i < 8; i++) {
      c.tick(12); // spend time so the clock cap never hides a grant
      grants.push(c.extend(12));
    }
    for (let i = 1; i < grants.length; i++) expect(grants[i]).toBeLessThan(grants[i - 1]);
    expect(grants.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(12 / (1 - RACE.decay) + 0.5);
  });

  it('a run that earns every bonus still ends by the level cap', () => {
    for (const levelIndex of [0, 2, 4]) {
      const c = createRaceClock({ levelIndex });
      let t = 0;
      let result = null;
      while (result !== 'over' && t < 1000) {
        result = c.tick(0.1);
        t += 0.1;
        if (Math.round(t * 10) % 50 === 0) c.extend(12); // a warp every 5 s, forever
      }
      expect(result).toBe('over');
      expect(t).toBeLessThanOrEqual(runCapFor(levelIndex) + 0.2);
    }
  });

  it('holding only the gas ends when the starting clock runs out', () => {
    const c = createRaceClock();
    let t = 0;
    while (c.tick(0.1) !== 'over') t += 0.1;
    expect(t).toBeCloseTo(RACE.startClock, 0);
  });

  it('announces the final stretch exactly once', () => {
    const c = createRaceClock();
    const events = [];
    for (let i = 0; i < 600; i++) { const e = c.tick(0.1); if (e) events.push(e); }
    expect(events.filter((e) => e === 'final')).toHaveLength(1);
    expect(events.at(-1)).toBe('over');
  });

  it('never grants time past the hard cap', () => {
    const c = createRaceClock({ levelIndex: 0 });
    c.tick(runCapFor(0) - 3);
    expect(c.extend(12)).toBeLessThanOrEqual(3);
  });
});
