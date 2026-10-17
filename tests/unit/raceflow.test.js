import { describe, it, expect } from 'vitest';
import {
  RACE_LAPS, FIELD_SIZE, RIVAL_PACES, raceLengthFor, rivalTargetMph, gridSlot, lapOf, standings, sortStandings,
  ordinal, gapSeconds, formatGap, formatRaceTime, projectedFinish, crossingTime, finishBonus, neighbours,
} from '../../src/raceflow.js';
import { runCapFor } from '../../src/race.js';

describe('race shape (ticket 0051)', () => {
  it('is three laps over a length that grows a little per level', () => {
    expect(RACE_LAPS).toBe(3);
    expect(raceLengthFor(1)).toBeGreaterThan(raceLengthFor(0));
    // About a minute at a steady 90 mph on level 1; a gas-only ~57 mph still makes the
    // line inside the level's 100 s cap.
    expect(raceLengthFor(0) / 90).toBeGreaterThan(50);
    expect(raceLengthFor(0) / 57).toBeLessThan(runCapFor(0));
  });

  it('fields five rivals, fastest first, that a clean ~95 mph run can beat', () => {
    expect(RIVAL_PACES).toHaveLength(FIELD_SIZE - 1);
    expect([...RIVAL_PACES].sort((a, b) => b - a)).toEqual(RIVAL_PACES);
    expect(RIVAL_PACES[0]).toBeLessThan(95);
    expect(RIVAL_PACES[RIVAL_PACES.length - 1]).toBeGreaterThan(57); // gas-only is last
  });

  it('rubber-bands softly: rivals far behind push, far ahead ease off', () => {
    expect(rivalTargetMph(90, 0)).toBe(90);
    expect(rivalTargetMph(90, -100)).toBeGreaterThan(90);
    expect(rivalTargetMph(90, -500)).toBeGreaterThan(rivalTargetMph(90, -100));
    expect(rivalTargetMph(90, 400)).toBeLessThan(90);
    expect(rivalTargetMph(90, 900)).toBeLessThan(rivalTargetMph(90, 400));
  });

  it('puts the grid ahead of you in two columns', () => {
    const slots = Array.from({ length: FIELD_SIZE - 1 }, (_, i) => gridSlot(i));
    for (const s of slots) expect(s.dz).toBeGreaterThan(0);
    expect(new Set(slots.map((s) => s.offset)).size).toBe(2);
    expect(slots[0].dz).toBeGreaterThan(slots[4].dz);
  });

  it('counts laps and clamps at the last one', () => {
    expect(lapOf(0, 3000).lap).toBe(1);
    expect(lapOf(999, 3000).lap).toBe(1);
    expect(lapOf(1000, 3000).lap).toBe(2);
    expect(lapOf(2999, 3000).lap).toBe(3);
    expect(lapOf(5000, 3000)).toEqual({ lap: 3, frac: 1 });
  });
});

describe('standings', () => {
  const field = [
    { id: 'a', progress: 100, finishTime: null },
    { id: 'b', progress: 300, finishTime: null },
    { id: 'c', progress: 6500, finishTime: 70.2 },
    { id: 'd', progress: 6500, finishTime: 68.9 },
  ];
  it('ranks finishers by time, then everyone else by progress', () => {
    expect(standings(field).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(field[0].id).toBe('a'); // standings() leaves its input alone
  });
  it('sortStandings sorts in place to the same order', () => {
    const arr = field.slice().reverse();
    expect(sortStandings(arr)).toBe(arr);
    expect(arr.map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
  });
  it('finds the cars either side with gaps in seconds', () => {
    const order = standings(field);
    const n = neighbours(order, 'b', () => 100);
    expect(n.ahead.id).toBe('c');
    expect(n.behind).toEqual({ id: 'a', seconds: 2 });
    expect(neighbours(order, 'zz', () => 100)).toEqual({ ahead: null, behind: null });
  });
});

describe('formatting and timing', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 6, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1ST', '2ND', '3RD', '4TH', '6TH', '11TH', '12TH', '13TH', '21ST', '22ND']);
  });
  it('gaps never divide by a standing start', () => {
    expect(gapSeconds(100, 100)).toBe(1);
    expect(gapSeconds(-100, 100)).toBe(1);
    expect(Number.isFinite(gapSeconds(100, 0))).toBe(true);
    expect(formatGap(1.234)).toBe('1.2s');
    expect(formatGap(63.25)).toBe('1:03.3');
  });
  it('race clock reads m:ss.t', () => {
    expect(formatRaceTime(0)).toBe('0:00.0');
    expect(formatRaceTime(65.04)).toBe('1:05.0');
    expect(formatRaceTime(9.96)).toBe('0:10.0'); // rounds once, never 0:010.0
    expect(formatRaceTime(59.97)).toBe('1:00.0');
    expect(formatRaceTime(9.94)).toBe('0:09.9');
  });
  it('projects an unfinished car and times a crossing inside the frame', () => {
    expect(projectedFinish(60, 6000, 6500, 100)).toBe(65);
    expect(crossingTime(10, 0.1, 6490, 6510, 6500)).toBeCloseTo(9.95);
    expect(crossingTime(10, 0.1, 6500, 6500, 6500)).toBe(10);
  });
  it('pays more for a better finish', () => {
    expect(finishBonus(1)).toBeGreaterThan(finishBonus(2));
    expect(finishBonus(6)).toBeGreaterThan(0);
    expect(finishBonus(9)).toBe(0);
  });
});
