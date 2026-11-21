import { describe, it, expect } from 'vitest';
import { resultSummary } from '../../src/results-summary.js';

describe('resultSummary (0294)', () => {
  it('says place, field and time for a finished race', () => {
    expect(resultSummary({ place: 2, total: 6, outcome: 'finished', time: 102.3 })).toBe('FINISHED 2ND OF 6 · TIME 1:42.3');
    expect(resultSummary({ place: 1, total: 6, outcome: 'finished', time: 59.96 })).toBe('FINISHED 1ST OF 6 · TIME 1:00.0');
  });
  it('names a wreck or a time-out without a finish time', () => {
    expect(resultSummary({ place: 5, total: 6, outcome: 'wrecked', time: 40 })).toBe('WRECKED · 5TH OF 6');
    expect(resultSummary({ place: 3, total: 6, outcome: 'timeup', time: 90 })).toBe('TIME UP · 3RD OF 6');
  });
  it('drops what it does not know', () => {
    expect(resultSummary({ place: 4, total: 0, outcome: 'finished', time: null })).toBe('FINISHED 4TH');
    expect(resultSummary({ place: 0, total: 0, outcome: 'wrecked' })).toBe('WRECKED');
  });
  it('reads an Endless run as distance and score', () => {
    expect(resultSummary({ endless: true, distance: 4210.4, score: 12345 })).toBe('RUN OVER · 4,210 M · SCORE 12,345');
    expect(resultSummary({ endless: true, distance: 0, score: 0 })).toBe('RUN OVER · SCORE 0');
  });
});
