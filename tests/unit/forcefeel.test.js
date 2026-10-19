import { describe, it, expect, afterEach, vi } from 'vitest';
import { rumbleFor, createForceFeel, FEEL } from '../../src/forcefeel.js';

const base = () => ({ status: 'PLAYING', speed: 90, playerY: 0, tyreSlip: 0, wheelSpin: 0, isDrifting: false, wallGrind: false, hp: 100 });

describe('rumbleFor (ticket 0180)', () => {
  it('is silent off the race and in the air', () => {
    expect(rumbleFor({ ...base(), status: 'TITLE', tyreSlip: 1 }, 0.5)).toEqual({ weak: 0, strong: 0 });
    expect(rumbleFor({ ...base(), playerY: 40, tyreSlip: 1 }, 0).weak).toBe(0);
  });

  it('the light motor grows with slip, wheelspin and a drift', () => {
    const calm = rumbleFor(base(), 0).weak;
    const slide = rumbleFor({ ...base(), tyreSlip: 0.5 }, 0).weak;
    const drift = rumbleFor({ ...base(), tyreSlip: 0.5, isDrifting: true }, 0).weak;
    expect(calm).toBeGreaterThan(0); // road texture at speed
    expect(calm).toBeLessThan(0.1);
    expect(slide).toBeGreaterThan(calm + 0.3);
    expect(drift).toBeGreaterThan(slide);
    expect(rumbleFor({ ...base(), tyreSlip: 5 }, 0).weak).toBe(1);
  });

  it('the heavy motor carries impulses and wall grinding', () => {
    expect(rumbleFor(base(), 0).strong).toBe(0);
    expect(rumbleFor({ ...base(), wallGrind: true }, 0).strong).toBeGreaterThan(0.2);
    expect(rumbleFor(base(), 0.6).strong).toBe(0.6);
  });
});

describe('createForceFeel', () => {
  afterEach(() => vi.unstubAllGlobals());
  function rig(over = {}) {
    const effects = [];
    const act = { playEffect: (type, p) => { effects.push({ type, ...p }); return Promise.resolve('complete'); }, reset: () => effects.push({ type: 'reset' }) };
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, vibrationActuator: act }] });
    const pulses = [];
    const state = base();
    let t = 0;
    const ff = createForceFeel({ state, settings: () => ({ haptics: true, hapticStrength: 1 }), haptics: () => ({ pulse: (k) => pulses.push(k) }), now: () => t, ...over });
    const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { t += dt * 1000; ff.frame(dt); } };
    return { effects, pulses, state, step, ff };
  }

  it('a wall hit kicks the heavy motor, then it fades; the phone pulses once', () => {
    const r = rig();
    r.step(5);
    r.state.wallGrind = true;
    r.step();
    const kick = r.effects[r.effects.length - 1];
    expect(kick.type).toBe('dual-rumble');
    expect(kick.strongMagnitude).toBeGreaterThan(0.7);
    r.state.wallGrind = false;
    r.step(40);
    const later = r.effects[r.effects.length - 1];
    expect(later.type === 'reset' || later.strongMagnitude < 0.1).toBe(true);
    expect(r.pulses.filter((k) => k === 'wall')).toHaveLength(1);
  });

  it('a hard landing thumps; a hop does not', () => {
    const r = rig();
    r.state.playerY = 30; r.step(3); r.state.playerY = 0; r.step();
    expect(r.pulses).not.toContain('land');
    r.state.playerY = 220; r.step(3); r.state.playerY = 0; r.step();
    expect(r.pulses).toContain('land');
  });

  it('keeps a held slide alive without flooding the actuator', () => {
    const r = rig();
    r.state.tyreSlip = 0.6;
    r.step(60); // one second
    expect(r.effects.length).toBeGreaterThan(5);
    expect(r.effects.length).toBeLessThan(20);
    for (const e of r.effects) expect(e.duration).toBe(FEEL.effectMs);
    expect(r.pulses.filter((k) => k === 'slip')).toHaveLength(1);
  });

  it('respects the Haptics switch and goes quiet off the race', () => {
    const off = rig({ settings: () => ({ haptics: false }) });
    off.state.tyreSlip = 1; off.step(30);
    expect(off.effects.every((e) => e.type === 'reset' || (e.weakMagnitude === 0 && e.strongMagnitude === 0))).toBe(true);
    const r = rig();
    r.state.tyreSlip = 1; r.step(5);
    r.state.status = 'PAUSED'; r.step();
    expect(r.effects[r.effects.length - 1].type).toBe('reset');
  });

  it('never throws without a gamepad', () => {
    vi.stubGlobal('navigator', {});
    const ff = createForceFeel({ state: base(), settings: () => ({}) });
    expect(() => { ff.frame(0.016); ff.stop(); }).not.toThrow();
  });
});
