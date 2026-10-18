// Run missions (ticket 0026): three visible goals per run, picked from the street contracts.
import { describe, it, expect } from 'vitest';
import { MISSIONS, pickMissions, advanceMission, missionsDone, recordMissions, missionsToday, titleMissionLine, missionLine } from '../../src/missions.js';
import { mulberry32, seedFor } from '../../src/daily.js';

describe('run missions', () => {
  it('picks three distinct missions per run', () => {
    for (let s = 1; s < 200; s++) {
      const run = pickMissions(mulberry32(s));
      expect(run).toHaveLength(3);
      expect(new Set(run.map((m) => m.type)).size).toBe(3);
      for (const m of run) {
        expect(MISSIONS.some((t) => t.type === m.type)).toBe(true);
        expect(m.progress).toBe(0);
        expect(m.done).toBe(false);
      }
    }
  });

  it('uses every mission type over many runs', () => {
    const seen = new Set();
    for (let s = 1; s < 100; s++) for (const m of pickMissions(mulberry32(s))) seen.add(m.type);
    expect(seen.size).toBe(MISSIONS.length);
  });

  it('daily runs get the same three for everyone', () => {
    const a = pickMissions(mulberry32(seedFor('2026-10-18') ^ 0x5eed));
    const b = pickMissions(mulberry32(seedFor('2026-10-18') ^ 0x5eed));
    expect(a.map((m) => m.type)).toEqual(b.map((m) => m.type));
  });

  it('tracks progress and reports a completion exactly once', () => {
    const run = pickMissions(mulberry32(7));
    const m = run[0];
    expect(advanceMission(run, m.type, m.target - 1)).toBe(null);
    expect(m.progress).toBe(m.target - 1);
    expect(m.done).toBe(false);
    expect(advanceMission(run, m.type, 5)).toBe(m);
    expect(m.done).toBe(true);
    expect(m.progress).toBe(m.target);
    expect(advanceMission(run, m.type, 5)).toBe(null);
    expect(missionsDone(run)).toBe(1);
  });

  it('ignores events no mission in this run tracks', () => {
    const run = pickMissions(mulberry32(3));
    const other = MISSIONS.find((t) => !run.some((m) => m.type === t.type));
    expect(advanceMission(run, other.type, 99999)).toBe(null);
    expect(advanceMission(null, 'TAKEDOWN', 1)).toBe(null);
    expect(missionsDone(run)).toBe(0);
  });

  it('remembers how many missions were completed today, resetting on a new day', () => {
    const save = {};
    expect(missionsToday(save, '2026-10-18')).toEqual({ done: 0, best: 0 });
    recordMissions(save, '2026-10-18', 1);
    recordMissions(save, '2026-10-18', 2);
    expect(missionsToday(save, '2026-10-18')).toEqual({ done: 3, best: 2 });
    expect(titleMissionLine(save, '2026-10-18')).toBe('🎯 3 MISSIONS · 2/3 DONE TODAY');
    expect(missionsToday(save, '2026-10-19')).toEqual({ done: 0, best: 0 });
    recordMissions(save, '2026-10-19', 0);
    expect(save.missions).toEqual({ day: '2026-10-19', done: 0, best: 0 });
    expect(titleMissionLine(save, '2026-10-19')).toBe('🎯 3 MISSIONS · 0/3 DONE TODAY');
  });

  it('survives a corrupt saved field', () => {
    const save = { missions: 'oops' };
    expect(missionsToday(save, '2026-10-18')).toEqual({ done: 0, best: 0 });
    recordMissions(save, '2026-10-18', 1);
    expect(missionsToday(save, '2026-10-18')).toEqual({ done: 1, best: 1 });
  });

  it('writes a results line with ✓ and the reward once done, progress before', () => {
    const run = pickMissions(mulberry32(11));
    const m = run[1];
    expect(missionLine(m)).toMatch(new RegExp(`0/${m.target}$`));
    advanceMission(run, m.type, m.target);
    expect(missionLine(m)).toMatch(new RegExp(`^✓ .* \\+${m.reward} ⚡$`));
  });
});

describe('mission table', () => {
  it('each label names its own target', () => {
    for (const m of MISSIONS) if (m.type !== 'WARP_88' && m.type !== 'SLIPSTREAM') expect(m.label).toContain(m.target.toLocaleString('en-US'));
  });
});
