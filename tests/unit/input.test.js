import { describe, it, expect, afterEach, vi } from 'vitest';
import { pollGamepad } from '../../src/input.js';

const btn = (pressed) => ({ pressed });
function pad({ axes = [0], pressed = [] } = {}) {
  const buttons = Array.from({ length: 16 }, (_, i) => btn(pressed.includes(i)));
  return { connected: true, axes, buttons };
}
const NEUTRAL = { steer: 0, gas: false, brake: false, boost: false, hover: false, nos: false };

describe('pollGamepad', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is neutral when the Gamepad API is missing or no pad is connected', () => {
    vi.stubGlobal('navigator', {});
    expect(pollGamepad()).toEqual(NEUTRAL);
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    expect(pollGamepad()).toEqual(NEUTRAL);
  });

  it('applies a 0.14 stick deadzone', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ axes: [0.1] })] });
    expect(pollGamepad().steer).toBe(0);
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ axes: [-0.6] })] });
    expect(pollGamepad().steer).toBe(-0.6);
  });

  it('falls back to the d-pad when the stick is centred', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ pressed: [15] })] });
    expect(pollGamepad().steer).toBe(1);
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ pressed: [14] })] });
    expect(pollGamepad().steer).toBe(-1);
  });

  it('maps face buttons and triggers', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [pad({ pressed: [7, 6, 5, 3] })] });
    expect(pollGamepad()).toEqual({ steer: 0, gas: true, brake: true, boost: true, hover: true, nos: false });
  });

  it('never throws if getGamepads throws', () => {
    vi.stubGlobal('navigator', { getGamepads: () => { throw new Error('blocked'); } });
    expect(pollGamepad()).toEqual(NEUTRAL);
  });
});
