import { describe, it, expect, afterEach, vi } from 'vitest';
import { RUMBLE, rumbleName, rumbleScale, testRumble, testText, TEST_MS } from '../../src/rumble.js';
import { createForceFeel } from '../../src/forcefeel.js';

const base = () => ({ status: 'PLAYING', speed: 90, playerY: 0, tyreSlip: 0, wheelSpin: 0, isDrifting: false, wallGrind: false, hp: 100 });

describe('rumble strength (ticket 0300)', () => {
  it('OFF / LOW / FULL scale the motors; unset and junk read as FULL', () => {
    expect(rumbleScale('off')).toBe(0);
    expect(rumbleScale('low')).toBe(0.5);
    expect(rumbleScale('full')).toBe(1);
    for (const junk of [undefined, null, '', 'max', 2, -1, {}, 'constructor', 'toString']) {
      expect(rumbleName(junk)).toBe('full');
      expect(rumbleScale(junk)).toBe(1);
    }
    expect(Object.isFrozen(RUMBLE)).toBe(true);
  });

  it('TEST buzzes once for 300 ms at the chosen level, says so without a pad, and stays still when OFF', () => {
    const effects = [];
    const act = { playEffect: (type, p) => { effects.push({ type, ...p }); return Promise.resolve('complete'); } };
    const nav = { getGamepads: () => [null, { connected: true, vibrationActuator: act }] };
    expect(testRumble('low', nav)).toBe('ok');
    expect(effects).toEqual([{ type: 'dual-rumble', startDelay: 0, duration: TEST_MS, weakMagnitude: 0.5, strongMagnitude: 0.5 }]);
    expect(TEST_MS).toBe(300);
    expect(testRumble(undefined, nav)).toBe('ok');
    expect(effects[1].strongMagnitude).toBe(1);
    expect(testRumble('off', nav)).toBe('off');
    expect(effects).toHaveLength(2);
    expect(testRumble('full', { getGamepads: () => [null, null] })).toBe('nopad');
    expect(testRumble('full', {})).toBe('nopad');
    expect(testRumble('full', { getGamepads: () => [{ connected: true }] })).toBe('nomotor');
    const pulses = [];
    expect(testRumble('low', { getGamepads: () => [{ connected: true, hapticActuators: [{ pulse: (v, ms) => pulses.push([v, ms]) }] }] })).toBe('ok');
    expect(pulses).toEqual([[0.5, 300]]);
    expect(testText('nopad')).toMatch(/No gamepad connected/);
    expect(testText('ok', 'low')).toBe('Buzzing at LOW.');
    expect(testText('off', 'off')).toMatch(/OFF/);
  });
});

describe('createForceFeel with a rumble choice (ticket 0300)', () => {
  afterEach(() => vi.unstubAllGlobals());
  function rig(choice) {
    const effects = [];
    const calls = { playEffect: 0, pulse: 0, reset: 0 };
    const act = {
      playEffect: (type, p) => { calls.playEffect++; effects.push({ type, ...p }); return Promise.resolve('complete'); },
      pulse: () => { calls.pulse++; },
      reset: () => { calls.reset++; effects.push({ type: 'reset' }); },
    };
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, vibrationActuator: act }] });
    const state = base();
    let t = 0;
    const box = { choice };
    const ff = createForceFeel({ state, settings: () => ({ haptics: true, hapticStrength: 1 }), rumble: () => box.choice, now: () => t });
    const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { t += dt * 1000; ff.frame(dt); } };
    return { effects, calls, state, step, box };
  }
  const peak = (r) => Math.max(...r.effects.filter((e) => e.type === 'dual-rumble').map((e) => e.strongMagnitude));
  const peakWeak = (r) => Math.max(...r.effects.filter((e) => e.type === 'dual-rumble').map((e) => e.weakMagnitude));
  const crash = (r) => { r.state.tyreSlip = 0.6; r.step(3); r.state.hp -= 10; r.step(); };

  it('FULL (and unset) is today\'s rumble; LOW halves both motors', () => {
    const full = rig('full'); crash(full);
    const unset = rig(undefined); crash(unset);
    const low = rig('low'); crash(low);
    expect(peak(full)).toBe(1);
    expect(unset.effects).toEqual(full.effects);
    expect(peak(low)).toBe(0.5);
    expect(peakWeak(low)).toBeCloseTo(peakWeak(full) / 2, 1);
    expect(peakWeak(low)).toBeGreaterThan(0);
  });

  it('OFF never calls playEffect or pulse, and silences a pad that was rumbling', () => {
    const off = rig('off'); crash(off); off.step(30);
    expect(off.calls.playEffect).toBe(0);
    expect(off.calls.pulse).toBe(0);
    const r = rig('full'); crash(r);
    expect(r.calls.playEffect).toBeGreaterThan(0);
    const before = r.calls.playEffect;
    r.box.choice = 'off'; r.step(30);
    expect(r.calls.playEffect).toBe(before);
    expect(r.effects[r.effects.length - 1].type).toBe('reset');
  });
});
