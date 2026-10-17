import { describe, it, expect } from 'vitest';
import { parseDeepLink, stripDeepLink, DEEP_RE } from '../../src/deeplink.js';

describe('deep links (ticket 0110)', () => {
  it('parses each param', () => {
    expect(parseDeepLink('?play=daily', 5).play).toBe('daily');
    expect(parseDeepLink('?play=QUICK', 5).play).toBe('quick');
    expect(parseDeepLink('?board=friends', 5).board).toEqual({ board: 'friends', mode: 'ARCADE' });
    expect(parseDeepLink('?board=track', 5).board).toEqual({ board: 'all', mode: 'ARCADE', track: true });
    expect(parseDeepLink('?board=daily', 5).board).toEqual({ board: 'daily', mode: 'DAILY' });
    expect(parseDeepLink('?level=3', 5).level).toBe(2);
    expect(parseDeepLink('?garage', 5).garage).toBe(true);
  });
  it('ignores junk safely', () => {
    const d = parseDeepLink('?play=hack&board=__proto__&level=9&level2=1', 5);
    expect(d).toEqual({ play: null, board: null, level: null, garage: false });
    expect(parseDeepLink('?level=0', 5).level).toBeNull();
    expect(parseDeepLink('?level=1.5', 5).level).toBeNull();
    expect(parseDeepLink('?level=', 5).level).toBeNull();
    expect(parseDeepLink('', 5)).toEqual({ play: null, board: null, level: null, garage: false });
  });
  it('strips only the one-shot params, keeping view, room and bare flags', () => {
    expect(stripDeepLink('?play=daily&view=3d&debug')).toBe('?view=3d&debug');
    expect(stripDeepLink('?board=week&garage&level=2')).toBe('');
    expect(stripDeepLink('?room=ABCD&play=friends')).toBe('?room=ABCD');
  });
  it('the boot check matches only the deep-link names', () => {
    expect(DEEP_RE.test('?view=3d&garage')).toBe(true);
    expect(DEEP_RE.test('?play=quick')).toBe(true);
    expect(DEEP_RE.test('?display=1&garages=2')).toBe(false);
    expect(DEEP_RE.test('?track=2&beat=60')).toBe(false);
  });
});
