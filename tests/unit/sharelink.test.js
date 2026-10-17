import { describe, it, expect } from 'vitest';
import { parseChallenge, challengeUrl, challengeBannerText, challengeVerdict, namesSentence, shareCopy } from '../../src/sharelink.js';

describe('challenge links (ticket 0053)', () => {
  it('round-trips a level challenge and a daily challenge', () => {
    const u = challengeUrl('https://mutaafaziz.com/outatime/', { levelIndex: 1, time: 62.34, initials: 'ace' });
    expect(u).toBe('https://mutaafaziz.com/outatime/?track=2&beat=62.3&by=ACE');
    expect(parseChallenge(new URL(u).search, 5)).toEqual({ levelIndex: 1, daily: null, beat: 62.3, by: 'ACE' });
    const d = challengeUrl('https://x/outatime/', { daily: '2026-10-17', time: 70, initials: '' });
    expect(parseChallenge(new URL(d).search, 5)).toEqual({ levelIndex: null, daily: '2026-10-17', beat: 70, by: '' });
  });
  it('never uses the live-room parameter name', () => {
    expect(challengeUrl('https://x/outatime/', { levelIndex: 0, time: 1 })).not.toMatch(/room=/);
  });
  it('rejects junk', () => {
    for (const q of ['', '?track=9&beat=60', '?track=0&beat=60', '?track=2&beat=-1', '?track=2&beat=abc', '?track=2', '?track=daily-xx&beat=5', '?track=2&beat=99999'])
      expect(parseChallenge(q, 5)).toBe(null);
    expect(parseChallenge('?track=2&beat=60&by=<script>', 5).by).toBe('SCR');
  });
  it('banner and verdict text', () => {
    const c = { beat: 62.3, by: 'ACE' };
    expect(challengeBannerText(c)).toBe('ACE CHALLENGES YOU: BEAT 1:02.3');
    expect(challengeVerdict(c, 61.1)).toMatchObject({ won: true });
    expect(challengeVerdict(c, 63).text).toMatch(/STILL STANDS/);
    expect(challengeVerdict(c, null)).toBe(null);
  });
  it('names a sentence and varies the brag by result', () => {
    expect(namesSentence(['DEZ'])).toBe('DEZ');
    expect(namesSentence(['DEZ', 'KAI'])).toBe('DEZ and KAI');
    expect(namesSentence(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
    const base = { total: 6, startPos: 6, time: 62.3, beat: ['Dez Navarro', 'Kai Mercer'] };
    expect(shareCopy({ ...base, place: 1 }).kicker).toBe('BACK OF THE GRID TO THE WIN');
    expect(shareCopy({ ...base, place: 1 }).brag).toMatch(/DEZ and KAI/);
    expect(shareCopy({ ...base, place: 2 }).kicker).toBe('COMEBACK KID');
    expect(shareCopy({ ...base, place: 5, startPos: 6, beatBy: 0.4 }).kicker).toBe('SO. CLOSE.');
    expect(shareCopy({ ...base, place: 6, beat: [] }).kicker).toBe('DEAD LAST, FULL SEND');
    expect(shareCopy({ ...base, place: 3, outcome: 'wrecked' }).kicker).toBe('TOTALLED IT');
  });
});
