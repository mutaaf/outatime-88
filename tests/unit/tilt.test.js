// The tilt reader (0223: moved out of settings-ui into the lazy src/tilt.js chunk).
import { describe, it, expect } from 'vitest';
import { createTiltReader } from '../../src/tilt.js';

const win = { screen: { orientation: { angle: 0 } }, innerWidth: 390, innerHeight: 844, document: { getElementById: () => null } };
const reading = (gamma, t) => ({ beta: 3, gamma, timeStamp: t });

describe('tilt reader (0223)', () => {
  it('the first reading after arm() is the zero and reports a signal; later ones steer', () => {
    const input = { tiltEnabled: false, tiltZeroOffset: 0, tiltSteerVal: 0 };
    const save = { data: { tiltSensitivity: 1, settings: { tiltInvert: false } } };
    let signals = 0;
    const r = createTiltReader(input, save, () => { signals++; input.tiltEnabled = true; }, win);
    r.read(reading(9, 10)); // not armed: no zero, no signal, tilt off
    expect(signals).toBe(0);
    expect(input.tiltSteerVal).toBe(0);
    r.arm();
    expect(r.armed).toBe(true);
    r.read(reading(5, 20));
    expect(signals).toBe(1);
    expect(r.armed).toBe(false);
    expect(input.tiltZeroOffset).toBe(5);
    expect(input.tiltSteerVal).toBe(0); // held as it was: straight
    r.read(reading(19, 40));
    expect(input.tiltSteerVal).toBeGreaterThan(0.3);
    save.data.settings.tiltInvert = true; // read live, not captured
    r.read(reading(19, 60));
    expect(input.tiltSteerVal).toBeLessThan(-0.3);
    expect(signals).toBe(1);
  });

  it('ignores readings with no angles and leaves steering alone while tilt is off', () => {
    const input = { tiltEnabled: false, tiltZeroOffset: 0, tiltSteerVal: 0 };
    const r = createTiltReader(input, { data: { settings: {} } }, () => {}, win);
    r.arm();
    r.read({ beta: null, gamma: null });
    expect(r.armed).toBe(true);
    r.read(reading(20, 10));
    expect(input.tiltSteerVal).toBe(0);
  });
});
