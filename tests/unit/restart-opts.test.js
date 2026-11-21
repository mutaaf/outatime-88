// Ticket 0292: RESTART RACE re-runs the same start call, only where a restart makes sense.
import { describe, it, expect } from 'vitest';
import { restartOpts } from '../../src/restart-opts.js';

const paused = (o) => ({ status: 'PAUSED', mode: 'ARCADE', daily: null, ...o });

describe('restartOpts', () => {
  it('a paused campaign race restarts as a plain start (same level and car, with the lights)', () => {
    expect(restartOpts(paused())).toEqual({});
  });

  it('a paused daily restarts as the daily (same seed)', () => {
    expect(restartOpts(paused({ daily: { day: '2026-11-21', seed: 7 } }))).toEqual({ daily: true });
  });

  it('Endless runs, live races and the TV get no restart', () => {
    expect(restartOpts(paused({ mode: 'INFINITE' }))).toBeNull();
    expect(restartOpts(paused({ mode: 'LIVE' }))).toBeNull();
    expect(restartOpts(paused(), true)).toBeNull();
    expect(restartOpts(paused({ daily: { seed: 1 } }), true)).toBeNull();
  });

  it('only from a pause: never on the title, the results or mid-race', () => {
    for (const status of ['TITLE', 'PLAYING', 'GAMEOVER', 'LIVE_DONE']) expect(restartOpts(paused({ status }))).toBeNull();
    expect(restartOpts(null)).toBeNull();
  });

  it('a race past the line (the finish roll-out, still pausable) offers no restart', () => {
    expect(restartOpts(paused({ racePhase: 'FINISHED' }))).toBeNull();
    expect(restartOpts(paused({ racePhase: 'RACING' }))).toEqual({});
  });
});
