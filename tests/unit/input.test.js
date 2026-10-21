import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { pollGamepad, PAD, InputState, setLastInput, padGone } from '../../src/input.js';

const btn = (pressed, value) => ({ pressed, value: value == null ? (pressed ? 1 : 0) : value });
function pad({ axes = [0, 0], pressed = [], values = {} } = {}) {
  const buttons = Array.from({ length: 16 }, (_, i) => btn(pressed.includes(i), values[i]));
  return { connected: true, axes, buttons };
}
const NEUTRAL = { steer: 0, gas: false, brake: false, gasAmt: 0, brakeAmt: 0, boost: false, hover: false, nos: false, back: false, l3: false };
const poll = (p) => { vi.stubGlobal('navigator', { getGamepads: () => [p] }); return { ...pollGamepad() }; };

describe('pollGamepad', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is neutral when the Gamepad API is missing or no pad is connected', () => {
    vi.stubGlobal('navigator', {});
    expect(pollGamepad()).toEqual(NEUTRAL);
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    expect(pollGamepad()).toEqual(NEUTRAL);
  });

  it('has a deadzone: a drifting or off-centre stick never steers (ticket 0183)', () => {
    expect(poll(pad({ axes: [0.1, 0] })).steer).toBe(0);
    expect(poll(pad({ axes: [0.08, -0.95] })).steer).toBe(0);
    expect(poll(pad({ axes: [-0.6, 0] })).steer).toBeLessThan(-0.4);
  });

  it('curves the response: fine near centre, full lock at the rim, monotonic', () => {
    expect(poll(pad({ axes: [1, 0] })).steer).toBe(1);
    expect(poll(pad({ axes: [-0.97, 0] })).steer).toBe(-1);
    const half = poll(pad({ axes: [0.54, 0] })).steer;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.5); // finer than linear
    let prev = 0;
    for (let x = 0.13; x <= 1; x += 0.01) {
      const s = poll(pad({ axes: [x, 0] })).steer;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(poll(pad({ axes: [PAD.dead + 0.005, 0] })).steer).toBeLessThan(0.01); // no jump out of the deadzone
  });

  it('falls back to the d-pad when the stick is centred', () => {
    expect(poll(pad({ pressed: [15] })).steer).toBe(1);
    expect(poll(pad({ pressed: [14] })).steer).toBe(-1);
  });

  it('reads the triggers as analog pedals; A and B are a full press', () => {
    const half = poll(pad({ values: { 7: 0.5, 6: 0.25 } }));
    expect(half.gas).toBe(true);
    expect(half.gasAmt).toBeCloseTo((0.5 - PAD.trigDead) / (1 - PAD.trigDead), 5);
    expect(half.brake).toBe(true);
    expect(half.brakeAmt).toBeCloseTo((0.25 - PAD.trigDead) / (1 - PAD.trigDead), 5);
    const rest = poll(pad({ values: { 7: 0.04 } }));
    expect(rest.gas).toBe(false);
    expect(rest.gasAmt).toBe(0);
    const ab = poll(pad({ pressed: [0, 1] }));
    expect([ab.gasAmt, ab.brakeAmt]).toEqual([1, 1]);
  });

  it('maps face buttons and triggers', () => {
    expect(poll(pad({ pressed: [7, 6, 5, 3] }))).toEqual({ ...NEUTRAL, gas: true, brake: true, gasAmt: 1, brakeAmt: 1, boost: true, hover: true });
  });

  it('BACK and the left-stick click are the steering-mode and co-pilot shortcuts (ticket 0130)', () => {
    const p = poll(pad({ pressed: [8, 10] }));
    expect(p.back).toBe(true);
    expect(p.l3).toBe(true);
  });

  it('reuses one result object (no garbage at 120 Hz)', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ axes: [0.5, 0] })] });
    expect(pollGamepad()).toBe(pollGamepad());
  });

  it('never throws if getGamepads throws', () => {
    vi.stubGlobal('navigator', { getGamepads: () => { throw new Error('blocked'); } });
    expect(pollGamepad()).toEqual(NEUTRAL);
  });
});

// Ticket 0007: the input in hand drives the prompts; a pad leaving drops back to the defaults.
describe('setLastInput / padGone', () => {
  beforeEach(() => { InputState.lastInput = ''; });
  afterEach(() => { vi.unstubAllGlobals(); InputState.lastInput = ''; });
  const fakeBody = () => {
    const set = new Set();
    vi.stubGlobal('document', { body: { classList: { toggle: (c, on) => (on ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) } } });
    return set;
  };

  it('marks the body while a pad is the input in hand, and only then', () => {
    const cls = fakeBody();
    setLastInput('pad');
    expect(InputState.lastInput).toBe('pad');
    expect(cls.has('input-pad')).toBe(true);
    setLastInput('keys');
    expect(cls.has('input-pad')).toBe(false);
  });

  it('a pad press makes the pad the input in hand', () => {
    fakeBody();
    setLastInput('keys');
    poll(pad({ pressed: [0] }));
    expect(InputState.lastInput).toBe('pad');
  });

  it('a disconnect reverts to the default words unless another pad is still in', () => {
    const cls = fakeBody();
    setLastInput('pad');
    vi.stubGlobal('navigator', { getGamepads: () => [null, pad()] });
    padGone();
    expect(InputState.lastInput).toBe('pad');
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    padGone();
    expect(InputState.lastInput).toBe('');
    expect(cls.has('input-pad')).toBe(false);
  });

  it('a disconnect never overrides keyboard or touch', () => {
    fakeBody();
    setLastInput('touch');
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    padGone();
    expect(InputState.lastInput).toBe('touch');
  });
});
