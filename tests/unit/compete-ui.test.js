import { describe, it, expect } from 'vitest';
import { rankMove, targetLine, rivalLine, timeLeft } from '../../src/compete-ui.js';

describe('competition text', () => {
  it('describes rank movement (lower is better)', () => {
    expect(rankMove(null, 4)).toEqual({ text: 'NEW', dir: 'new' });
    expect(rankMove(12, 8)).toEqual({ text: '▲ 4', dir: 'up' });
    expect(rankMove(3, 5)).toEqual({ text: '▼ 2', dir: 'down' });
    expect(rankMove(2, 2).dir).toBe('same');
  });
  it('names exactly who to beat next, preferring this week', () => {
    const ahead = (initials, gap, rank) => ({ initials, gap, rank, score: 0 });
    expect(targetLine({ week: { rank: 3, ahead: ahead('BIF', 12400, 2) }, all: { rank: 9, ahead: ahead('ACE', 1, 8) } }))
      .toBe('🎯 12,400 BEHIND BIF FOR #2 THIS WEEK');
    expect(targetLine({ week: { rank: 1, ahead: null }, all: { rank: 4, ahead: ahead('ACE', 500, 3) } })).toContain('ALL-TIME');
    expect(targetLine({ week: { rank: 1 }, all: { rank: 1 } })).toContain('#1 ALL-TIME');
    expect(targetLine(null)).toBe('');
  });
  it('leads the title with who passed you, else your rival', () => {
    expect(rivalLine({ boards: { all: { rank: 4 } }, overtaken: [{ initials: 'ZED' }, { initials: 'MAX' }] })).toBe("🚨 ZED +1 PASSED YOU — YOU'RE #4 NOW. TAKE IT BACK!");
    expect(rivalLine({ boards: { all: { rank: 5 }, week: { rank: 2, ahead: { initials: 'DOC', gap: 800 } } }, overtaken: [] })).toBe('⚔️ RIVAL DOC IS 800 AHEAD THIS WEEK');
    expect(rivalLine({ boards: { all: { rank: 1 }, week: { rank: 1 } }, overtaken: [] })).toContain('#1 THIS WEEK');
    expect(rivalLine({ boards: { all: null, week: null } })).toBe('');
    expect(rivalLine(null)).toBe('');
  });
  it('counts down the season', () => {
    const now = Date.UTC(2026, 9, 21, 12);
    expect(timeLeft(now + (3 * 24 + 4) * 3600e3 + 5, now)).toBe('3D 4H');
    expect(timeLeft(now + 5 * 3600e3 + 12 * 60e3, now)).toBe('5H 12M');
    expect(timeLeft(now - 1, now)).toBe('0M');
  });
});
