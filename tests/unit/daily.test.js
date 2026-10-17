import { describe, it, expect } from 'vitest';
import { dailySpec, mulberry32, seedFor, MODIFIERS } from '../../src/daily.js';
import { normalizeInitials, rankLine } from '../../src/leaderboard.js';

describe('daily challenge', () => {
  it('is the same for everyone on a given UTC day', () => {
    expect(dailySpec('2026-10-17')).toEqual(dailySpec('2026-10-17'));
  });
  it('changes from day to day and uses every level and modifier over a month', () => {
    const levels = new Set(); const mods = new Set();
    for (let d = 1; d <= 31; d++) {
      const s = dailySpec(`2026-10-${String(d).padStart(2, '0')}`);
      levels.add(s.levelIndex); mods.add(s.modifier.id);
      expect(s.levelIndex).toBeGreaterThanOrEqual(0);
      expect(s.levelIndex).toBeLessThan(5);
    }
    expect(levels.size).toBe(5);
    expect(mods.size).toBe(MODIFIERS.length);
  });
  it('seeded traffic RNG repeats exactly for a seed', () => {
    const a = mulberry32(seedFor('2026-10-17')); const b = mulberry32(seedFor('2026-10-17'));
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('leaderboard client helpers', () => {
  it('normalises initials', () => {
    expect(normalizeInitials('c.l-d')).toBe('CLD');
    expect(normalizeInitials('ab')).toBeNull();
    expect(normalizeInitials('abcd')).toBeNull();
  });
  it('formats a rank line', () => {
    expect(rankLine({ all: 12, daily: 3 })).toBe('#12 ALL-TIME · #3 TODAY');
    expect(rankLine(null)).toBe('');
  });
});
