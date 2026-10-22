// Ticket 0191: a quiet tick, panned to the side of whatever you're about to hit within 0.8 s.
import { describe, it, expect } from 'vitest';
import { PROX, chooseCue, createLimiter, createProximityCue } from '../../src/proximity-cue.js';
import { FakeAudioContext } from './fake-audio.js';

// You on the road at z 1000 doing 100 world units/s, 0.14 wide either side of the middle,
// 105 long, 34 tall, 10 s into the race.
const me = (x = 0, vz = 100, extra = {}) => ({ x, z: 1000, vz, halfW: 0.14, halfL: 105, bot: 0, top: 34, now: 10, ...extra });
// A car whose back bumper is `secs` away at your closing speed (it stands still).
const car = (offset, secs, extra = {}) => ({ worldZ: 1000 + 105 + 100 + secs * 100, offset, halfW: 0.12, halfL: 100, vz: 0, y: 0, height: 38, ...extra });

describe('chooseCue', () => {
  it('pans left, centre or right to where the threat is', () => {
    expect(chooseCue(me(), [car(-0.2, 0.5)], [])).toBe(-1);
    expect(chooseCue(me(), [car(0, 0.5)], [])).toBe(0);
    expect(chooseCue(me(), [], [car(0.2, 0.5)])).toBe(1);
    expect(chooseCue(me(0.5), [car(0.3, 0.5)], [])).toBe(-1); // relative to you, not the road
  });

  it('is null when nothing will hit within 0.8 s', () => {
    expect(chooseCue(me(), [], [])).toBeNull();
    expect(chooseCue(me(), [car(0, PROX.horizon + 0.05)], [])).toBeNull();
    expect(chooseCue(me(), [car(0.3, 0.3)], [])).toBeNull(); // a lane over: it won't touch you
    expect(chooseCue(me(), [car(0, 0.3, { vz: 120 })], [])).toBeNull(); // pulling away
    expect(chooseCue(me(0, 0), [car(0, 0.3)], [])).toBeNull(); // you're stopped
    expect(chooseCue(me(), [car(0, -0.3)], [])).toBeNull(); // already beside or behind you
    expect(chooseCue(me(), [car(0, 0.3, { idle: true }), car(0, 0.3, { takenDown: true }), car(0, 0.3, { hitCount: 1 })], [])).toBeNull();
  });

  it('counts rivals too, and forgets a car you are already against', () => {
    expect(chooseCue(me(), [], [], [car(-0.2, 0.4, { vz: 40 })])).toBe(-1);
    expect(chooseCue(me(), [car(0, 0.05, { touchT: 9.8 })], [], [car(0, 0.05, { touchT: 9.7 })])).toBeNull();
    expect(chooseCue(me(), [car(0, 0.05, { touchT: 9.4 })], [])).toBe(0); // that contact was a while ago
  });

  it('stays quiet for what you are jumping over or sliding under right now', () => {
    const sedan = car(0, 0.4);
    expect(chooseCue(me(0, 100, { bot: 40, top: 74 }), [sedan], [])).toBeNull(); // airborne over it
    expect(chooseCue(me(0, 100, { bot: 30, top: 64 }), [sedan], [])).toBe(0); // not high enough yet
    const bar = car(0, 0.4, { height: 90, clearanceY: 20 }); // a gate you can slide under
    expect(chooseCue(me(0, 100, { top: 18 }), [], [bar])).toBeNull(); // sliding
    expect(chooseCue(me(), [], [bar])).toBe(0); // standing tall: it will hit you
    expect(chooseCue(me(), [car(0, 0.4, { y: 60 })], [])).toBeNull(); // a car flying over your roof
  });

  it('picks the soonest threat when several are coming', () => {
    expect(chooseCue(me(), [car(-0.2, 0.6)], [car(0.2, 0.2)])).toBe(1);
    expect(chooseCue(me(), [car(-0.2, 0.1), car(0, 0.7)], [car(0.2, 0.2)])).toBe(-1);
  });

  it('counts a car ahead moving slower than you by the closing speed', () => {
    // It's doing 60 of your 100, so a 32-unit gap closes at 40/s: 0.8 s.
    const slow = car(0, 0.32, { vz: 60 });
    expect(chooseCue(me(), [slow], [])).toBe(0);
    expect(chooseCue(me(), [car(0, 0.34, { vz: 60 })], [])).toBeNull(); // 0.85 s
  });
});

describe('createLimiter', () => {
  it('never lets more than 4 cues through in any 1 s window, even in a dense field', () => {
    const gate = createLimiter();
    const times = [];
    let t = 0;
    for (let i = 0; i < 120 * 10; i++) { t += 1 / 120; if (gate(1 / 120, true)) times.push(t); }
    expect(times.length).toBeGreaterThan(30);
    for (let i = 0; i < times.length; i++) expect(times.filter((x) => x >= times[i] && x <= times[i] + 1).length).toBeLessThanOrEqual(4);
  });

  it('plays the first threat at once and stays quiet without one', () => {
    const gate = createLimiter();
    expect(gate(1 / 120, false)).toBe(false);
    expect(gate(1 / 120, true)).toBe(true);
    expect(gate(1 / 120, true)).toBe(false);
  });
});

describe('createProximityCue', () => {
  const engine = (over = {}) => {
    const ctx = new FakeAudioContext();
    return { ctx, sfxBus: ctx.createGain(), muted: false, volume: 0.8, ...over };
  };
  const threat = [car(0.2, 0.4)];

  it('starts one buffer source on the SFX bus, panned to the threat', () => {
    const se = engine();
    const cue = createProximityCue(se, () => true);
    expect(cue.step(1 / 120, me(), threat, [])).toBe(1);
    expect(se.ctx.started).toHaveLength(1);
    expect(se.ctx.started[0].node.kind).toBe('buffer');
    const panner = se.ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner.pan.value).toBeGreaterThan(0);
    expect(se.ctx.edges.some(([a, b]) => a === panner && b === se.sfxBus)).toBe(true);
    // The voice is built once; later ticks reuse its buffer, gain and panner.
    const built = se.ctx.nodes.length;
    for (let i = 0; i < 120; i++) cue.step(1 / 120, me(), [car(-0.2, 0.4)], []);
    expect(se.ctx.started.length).toBe(4);
    expect(se.ctx.nodes.length - built).toBe(3); // one fresh one-shot source per later tick, nothing else
    expect(new Set(se.ctx.started.map((s) => s.node.buffer)).size).toBe(1);
    expect(panner.pan.value).toBeLessThan(0);
  });

  it('starts nothing when muted, at zero volume, toggled off, suspended, or with no audio yet', () => {
    const asleep = engine();
    asleep.ctx.state = 'suspended';
    for (const [se, on] of [[engine({ muted: true }), true], [engine({ volume: 0 }), true], [engine(), false], [asleep, true]]) {
      const cue = createProximityCue(se, () => on);
      for (let i = 0; i < 240; i++) cue.step(1 / 120, me(), threat, []);
      expect(se.ctx.started).toHaveLength(0);
    }
    const silent = engine();
    const quiet = createProximityCue(silent, () => true, true); // ?debug: chooses, never sounds
    expect(quiet.step(1 / 120, me(), threat, [])).toBe(1);
    expect(silent.ctx.started).toHaveLength(0);
    expect(createProximityCue(engine(), () => false).step(1 / 120, me(), threat, [])).toBeNull();
    const none = { ctx: null, sfxBus: null, muted: false, volume: 1 };
    expect(() => createProximityCue(none, () => true).step(1 / 120, me(), threat, [])).not.toThrow();
  });
});
