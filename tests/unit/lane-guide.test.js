// Ticket 0219: an optional soft tone, panned toward the nearest lane with nothing coming in the
// next ~1.2 s, pitch rising as the gap closes; silent when your own lane is clear.
import { describe, it, expect } from 'vitest';
import { GUIDE, chooseLane, createLaneGuide } from '../../src/lane-guide.js';
import { FakeAudioContext } from './fake-audio.js';

// The same fixtures as the 0191 proximity cue: you at z 1000 doing 100 world units/s, 0.14 wide
// either side of your middle, 105 long, 34 tall, 10 s into the race.
const me = (x = 0, vz = 100, extra = {}) => ({ x, z: 1000, vz, halfW: 0.14, halfL: 105, bot: 0, top: 34, now: 10, ...extra });
// A car whose back bumper is `secs` away at your closing speed (it stands still).
const car = (offset, secs, extra = {}) => ({ worldZ: 1000 + 105 + 100 + secs * 100, offset, halfW: 0.12, halfL: 100, vz: 0, y: 0, height: 38, ...extra });
const [L, C, R] = GUIDE.lanes;

describe('chooseLane', () => {
  it('pans toward the nearest open lane, relative to you', () => {
    expect(chooseLane(me(L), [car(L, 0.6)], [])).toBe(1); // left lane blocked: centre is to your right
    expect(chooseLane(me(R), [car(R, 0.6)], [])).toBe(-1);
    expect(chooseLane(me(C), [car(C, 0.6), car(L, 0.9)], [])).toBe(1); // left taken too: go right
    expect(chooseLane(me(C), [car(C, 0.6)], [car(R, 1.0)])).toBe(-1);
    expect(chooseLane(me(L), [car(L, 0.6)], [car(C, 0.9)])).toBe(1); // the far lane, still to your right
    expect(chooseLane(me(R), [car(R, 0.6), car(C, 0.9)], [])).toBe(-1);
  });

  it('sits centred when the open lane is the one you are nearly in already', () => {
    // You're straddling just off the centre lane's middle and a car on the line clips your edge.
    expect(chooseLane(me(0.04), [car(0.28, 0.6)], [])).toBe(0);
  });

  it('on a tie between two open lanes, points away from the threat', () => {
    expect(chooseLane(me(C), [car(0.05, 0.6)], [])).toBe(-1);
    expect(chooseLane(me(C), [car(-0.05, 0.6)], [])).toBe(1);
  });

  it('is null when your own lane is clear for the next 1.2 s', () => {
    expect(chooseLane(me(), [], [])).toBeNull();
    expect(chooseLane(me(), [car(C, GUIDE.horizon + 0.05)], [])).toBeNull();
    expect(chooseLane(me(), [car(L, 0.3), car(R, 0.3)], [])).toBeNull(); // both sides busy, yours open
    expect(chooseLane(me(), [car(C, 0.5, { vz: 140 })], [])).toBeNull(); // pulling away
    expect(chooseLane(me(), [car(C, 0.5, { idle: true })], [])).toBeNull();
    expect(chooseLane(me(0, 100, { bot: 40, top: 74 }), [car(C, 0.5)], [])).toBeNull(); // jumping it
  });

  it('is null with every lane blocked: no tone that points into another hit', () => {
    expect(chooseLane(me(), [car(L, 0.9), car(C, 0.5)], [car(R, 1.1)])).toBeNull();
    expect(chooseLane(me(L), [car(L, 0.4)], [car(C, 0.6)], [car(R, 1.0, { vz: 10 })])).toBeNull(); // a rival counts
  });

  it('reports how soon your own lane closes, for the pitch', () => {
    const out = { t: 0 };
    chooseLane(me(), [car(C, 0.6)], [], undefined, out);
    expect(out.t).toBeCloseTo(0.6, 5);
  });

  it('looks further ahead than the 0191 tick', () => {
    expect(GUIDE.horizon).toBeCloseTo(1.2, 5);
    expect(chooseLane(me(), [car(C, 1.1)], [])).not.toBeNull();
  });
});

describe('createLaneGuide', () => {
  const engine = (over = {}) => {
    const ctx = new FakeAudioContext();
    return { ctx, sfxBus: ctx.createGain(), muted: false, volume: 0.8, ...over };
  };
  const blocked = [car(C, 0.6)];

  it('runs one sine on the SFX bus, panned toward the open lane, and lets it go once the lane is clear', () => {
    const se = engine();
    const guide = createLaneGuide(se, () => true);
    expect(guide.step(1 / 120, me(), [car(0.05, 0.6)], [])).toBe(-1);
    expect(se.ctx.started).toHaveLength(1);
    const osc = se.ctx.started[0].node;
    expect(osc.kind).toBe('osc');
    expect(osc.type).toBe('sine');
    const panner = se.ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner.pan.value).toBeLessThan(0);
    expect(se.ctx.edges.some(([a, b]) => a === panner && b === se.sfxBus)).toBe(true);
    // A second of guidance reuses the same voice: no new nodes, no new sources.
    const built = se.ctx.nodes.length;
    for (let i = 0; i < 120; i++) guide.step(1 / 120, me(), [car(-0.05, 0.6)], []);
    expect(se.ctx.nodes.length).toBe(built);
    expect(se.ctx.started).toHaveLength(1);
    expect(panner.pan.value).toBeGreaterThan(0);
    // Lane clear: the tone fades and, after a quiet spell, the oscillator stops.
    let stopped = false;
    osc.stop = () => { stopped = true; };
    expect(guide.step(1 / 120, me(), [], [])).toBeNull();
    const gain = se.ctx.nodes.find((n) => n.kind === 'gain' && n !== se.sfxBus);
    expect(gain.gain.value).toBe(0);
    for (let i = 0; i < 240; i++) guide.step(1 / 120, me(), [], []);
    expect(stopped).toBe(true);
    // The next threat starts a fresh one.
    guide.step(1 / 120, me(), blocked, []);
    expect(se.ctx.started).toHaveLength(2);
  });

  it('fades on its own if the race stops stepping it (pause, results)', () => {
    const se = engine();
    const guide = createLaneGuide(se, () => true);
    guide.step(1 / 120, me(), blocked, []);
    const gain = se.ctx.nodes.find((n) => n.kind === 'gain' && n !== se.sfxBus);
    const last = gain.gain.events[gain.gain.events.length - 1];
    expect(last[0]).toBe('lin');
    expect(last[1]).toBe(0);
    expect(last[2]).toBeLessThanOrEqual(GUIDE.hold + GUIDE.release + 1e-9);
  });

  it('rises in pitch as the gap closes', () => {
    const se = engine();
    const guide = createLaneGuide(se, () => true);
    guide.step(1 / 120, me(), [car(C, 1.1)], []);
    const osc = se.ctx.started[0].node;
    const far = osc.frequency.value;
    guide.step(1 / 120, me(), [car(C, 0.2)], []);
    expect(osc.frequency.value).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(GUIDE.lo);
    expect(osc.frequency.value).toBeLessThanOrEqual(GUIDE.hi);
  });

  it('starts nothing when muted, at zero volume, toggled off, suspended, or with no audio yet', () => {
    const asleep = engine();
    asleep.ctx.state = 'suspended';
    for (const [se, on] of [[engine({ muted: true }), true], [engine({ volume: 0 }), true], [engine(), false], [asleep, true]]) {
      const guide = createLaneGuide(se, () => on);
      for (let i = 0; i < 240; i++) guide.step(1 / 120, me(), blocked, []);
      expect(se.ctx.started).toHaveLength(0);
    }
    const silent = engine();
    const quiet = createLaneGuide(silent, () => true, true); // ?debug: chooses, never sounds
    expect(quiet.step(1 / 120, me(), blocked, [])).not.toBeNull();
    expect(silent.ctx.started).toHaveLength(0);
    expect(createLaneGuide(engine(), () => false).step(1 / 120, me(), blocked, [])).toBeNull();
    const none = { ctx: null, sfxBus: null, muted: false, volume: 1 };
    expect(() => createLaneGuide(none, () => true).step(1 / 120, me(), blocked, [])).not.toThrow();
  });

  it('goes quiet at once when muted mid-tone', () => {
    const se = engine();
    const guide = createLaneGuide(se, () => true);
    guide.step(1 / 120, me(), blocked, []);
    se.muted = true;
    guide.step(1 / 120, me(), blocked, []);
    const gain = se.ctx.nodes.find((n) => n.kind === 'gain' && n !== se.sfxBus);
    expect(gain.gain.value).toBe(0);
  });
});
