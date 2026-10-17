// Haptics: platform selection (Android vibrate / iOS switch tick / none), throttling, the
// on/off switch, strength, and calm mode.
import { describe, it, expect, vi } from 'vitest';
import { hapticEngine, createHaptics, scalePattern, HAPTIC_PATTERNS, HAPTIC_GAP } from '../../src/touch/haptics.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

/** A tiny DOM: inputs know `switch` only when `switchSupport` is on. */
function fakeDoc({ switchSupport = true } = {}) {
  const clicks = { n: 0 };
  const make = (tag) => {
    const e = { tag, style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }, click() { if (tag === 'label') clicks.n++; } };
    if (tag === 'input' && switchSupport) e.switch = false;
    return e;
  };
  return { clicks, createElement: make, body: { appendChild() {} } };
}
const win = (nav) => ({ navigator: nav, setTimeout: (fn) => fn(), performance: { now: () => 0 } });

describe('which haptic engine', () => {
  it('Android / Chrome: the Vibration API', () => {
    expect(hapticEngine(win({ vibrate() {}, userAgent: 'Android' }), fakeDoc())).toBe('vibrate');
  });
  it('iPhone with switch support (iOS 18): the switch tick', () => {
    expect(hapticEngine(win({ userAgent: IPHONE, maxTouchPoints: 5 }), fakeDoc())).toBe('ios');
  });
  it('iPadOS Safari says "Macintosh" but has touch points: still iOS', () => {
    expect(hapticEngine(win({ userAgent: IPAD, maxTouchPoints: 5 }), fakeDoc())).toBe('ios');
  });
  it('old iOS without the switch input, and desktop Safari: nothing', () => {
    expect(hapticEngine(win({ userAgent: IPHONE, maxTouchPoints: 5 }), fakeDoc({ switchSupport: false }))).toBe('none');
    expect(hapticEngine(win({ userAgent: IPAD, maxTouchPoints: 0 }), fakeDoc())).toBe('none');
  });
});

describe('pulses', () => {
  const setup = (over = {}) => {
    let t = 1000;
    const vibrate = vi.fn();
    const settings = { haptics: true, hapticStrength: 1, ...over.settings };
    const hx = createHaptics({ win: win({ vibrate }), doc: fakeDoc(), settings: () => settings, calm: over.calm || (() => false), now: () => t, engine: over.engine });
    return { hx, vibrate, settings, tick: (ms) => { t += ms; } };
  };

  it('each event has its own pattern', () => {
    const { hx, vibrate } = setup();
    expect(hx.pulse('boost')).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.boost);
    hx.pulse('engage');
    expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.engage);
  });

  it('throttles repeats of the same event, not different events', () => {
    const { hx, vibrate, tick } = setup();
    expect(hx.pulse('hit')).toBe(true);
    tick(HAPTIC_GAP.hit - 1);
    expect(hx.pulse('hit')).toBe(false); // a wall scrape doesn't buzz every frame
    expect(hx.pulse('press')).toBe(true);
    tick(2);
    expect(hx.pulse('hit')).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it('off means off', () => {
    const { hx, vibrate } = setup({ settings: { haptics: false } });
    expect(hx.pulse('boost')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('strength scales the buzz; light skips crash and lap rumbles; calm mode skips them too', () => {
    const { hx, vibrate } = setup({ settings: { hapticStrength: 0.5 } });
    hx.pulse('boost');
    expect(vibrate).toHaveBeenLastCalledWith(scalePattern(HAPTIC_PATTERNS.boost, 0.5));
    expect(scalePattern([16, 30, 24], 0.5)).toEqual([8, 30, 12]);
    expect(setup({ settings: { hapticStrength: 0.3 } }).hx.pulse('hit')).toBe(false);
    expect(setup({ settings: { hapticStrength: 0.3 } }).hx.pulse('press')).toBe(true);
    const calm = setup({ calm: () => true });
    expect(calm.hx.pulse('lap')).toBe(false);
    expect(calm.hx.pulse('press')).toBe(true);
  });

  it('iOS: one switch tick per pulse segment, one only at low strength', () => {
    const doc = fakeDoc();
    const settings = { haptics: true, hapticStrength: 1 };
    let t = 0;
    const hx = createHaptics({ win: win({}), doc, settings: () => settings, now: () => (t += 1000), engine: 'ios' });
    hx.pulse('boost'); // [on, off, on] → 2 ticks
    expect(doc.clicks.n).toBe(2);
    settings.hapticStrength = 0.5;
    hx.pulse('boost');
    expect(doc.clicks.n).toBe(3);
  });

  it('a browser that throws (no user gesture yet) never breaks the game', () => {
    const hx = createHaptics({ win: win({ vibrate() { throw new Error('blocked'); } }), doc: fakeDoc(), settings: () => ({ haptics: true }), now: () => 0, engine: 'vibrate' });
    expect(hx.pulse('press')).toBe(false);
  });
});
