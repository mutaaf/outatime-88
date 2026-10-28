import { describe, it, expect } from 'vitest';
import { ERA_SCORES, DEFAULT_SCORE, scoreFor, layersFor, stepDuration, noteFreq, midiToFreq, createScheduler, stingNotes, createSting, beatAt, STING_DELAY } from '../../src/music.js';
import { ERAS } from '../../src/data.js';
import { FakeAudioContext } from './fake-audio.js';

describe('score tables', () => {
  it('every era in the game has a valid score (falls back to the default otherwise)', () => {
    for (const era of ERAS) {
      const s = scoreFor(era.id);
      expect(s.bpm).toBeGreaterThanOrEqual(80);
      expect(s.bpm).toBeLessThanOrEqual(160);
      for (const part of ['bass', 'arp', 'lead']) expect(s[part]).toHaveLength(16);
      for (const d of ['kick', 'snare', 'hat']) expect(s.drums[d]).toHaveLength(16);
      expect(s.scale.length).toBeGreaterThanOrEqual(5);
    }
    expect(scoreFor('no-such-era')).toBe(DEFAULT_SCORE);
  });

  it('every era has its own score, not the fallback (1955 included, ticket 0008)', () => {
    for (const era of ERAS) expect(ERA_SCORES[era.id], era.id).toBeDefined();
    expect(ERA_SCORES['1955'].bpm).toBeLessThan(110);
  });

  it('eras sound different from each other (tempo or scale differs)', () => {
    const sigs = new Set(Object.values(ERA_SCORES).map((s) => `${s.bpm}:${s.scale.join(',')}:${s.root}`));
    expect(sigs.size).toBe(Object.keys(ERA_SCORES).length);
  });

  it('noteFreq maps scale degrees to rising frequencies, A4 = 440 at midi 69', () => {
    const s = { root: 69, scale: [0, 2, 3, 5, 7, 8, 10] };
    expect(noteFreq(s, 0, 0)).toBeCloseTo(440, 5);
    expect(noteFreq(s, 7, 0)).toBeCloseTo(880, 5); // degree 7 wraps to next octave
    expect(noteFreq(s, 1, 0)).toBeGreaterThan(noteFreq(s, 0, 0));
    expect(noteFreq(s, 0, -1)).toBeCloseTo(220, 5);
  });

  it('stepDuration is a sixteenth note', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125, 6);
  });
});

describe('layersFor', () => {
  it('adds layers as speed rises: drums always, bass ≥30, arp ≥60, lead+pad ≥86', () => {
    expect(layersFor(0, false)).toEqual({ drums: true, bass: false, arp: false, lead: false, pad: false });
    expect(layersFor(30, false).bass).toBe(true);
    expect(layersFor(59, false).arp).toBe(false);
    expect(layersFor(60, false).arp).toBe(true);
    expect(layersFor(85, false).lead).toBe(false);
    expect(layersFor(86, false)).toEqual({ drums: true, bass: true, arp: true, lead: true, pad: true });
  });

  it('a warp turns every layer on regardless of speed', () => {
    expect(layersFor(10, true)).toEqual({ drums: true, bass: true, arp: true, lead: true, pad: true });
  });

  it('is monotonic: a layer on at speed v stays on at any higher speed', () => {
    for (let v = 0; v < 140; v += 1) {
      const a = layersFor(v, false), b = layersFor(v + 1, false);
      for (const k of Object.keys(a)) if (a[k]) expect(b[k]).toBe(true);
    }
  });
});

describe('createScheduler', () => {
  function setup(state) {
    const ctx = new FakeAudioContext();
    const out = ctx.createGain();
    const sched = createScheduler(ctx, out, () => state);
    return { ctx, sched };
  }

  it('schedules only within the lookahead window and never in the past', () => {
    const state = { playing: true, speed: 100, eraId: '1985', warp: false };
    const { ctx, sched } = setup(state);
    ctx.currentTime = 5;
    sched.tick();
    const starts = ctx.started.map((s) => s.when);
    expect(starts.length).toBeGreaterThan(0);
    for (const t of starts) {
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeLessThanOrEqual(5 + sched.lookahead + 1e-9);
    }
  });

  it('resyncs after a stall instead of scheduling a burst in the past', () => {
    const state = { playing: true, speed: 100, eraId: '1985', warp: false };
    const { ctx, sched } = setup(state);
    ctx.currentTime = 1; sched.tick();
    ctx.started.length = 0;
    ctx.currentTime = 30; // tab was backgrounded
    sched.tick();
    for (const s of ctx.started) expect(s.when).toBeGreaterThanOrEqual(30);
    const steps = ctx.started.length;
    expect(steps).toBeLessThan(60); // no catch-up burst of hundreds of notes
  });

  it('is silent while not playing, and more voices play at speed than at rest', () => {
    const state = { playing: false, speed: 0, eraId: '2026', warp: false };
    const { ctx, sched } = setup(state);
    ctx.currentTime = 0; sched.tick();
    expect(ctx.started.length).toBe(0);

    state.playing = true;
    for (let t = 0; t < 4; t += 0.05) { ctx.currentTime = t; sched.tick(); }
    const slow = ctx.started.length;

    const fast = setup({ playing: true, speed: 120, eraId: '2026', warp: false });
    for (let t = 0; t < 4; t += 0.05) { fast.ctx.currentTime = t; fast.sched.tick(); }
    expect(fast.ctx.started.length).toBeGreaterThan(slow);
  });
});

// Ticket 0217: a one-bar sting when a warp lands in a new era.
describe('warp landing sting', () => {
  const pitchClass = (sc, hz) => ((Math.round(69 + 12 * Math.log2(hz / 440)) - sc.root) % 12 + 12) % 12;

  it("every note comes from the key's scale, rising, resolving on its tonic, inside one bar", () => {
    for (const [id, sc] of Object.entries(ERA_SCORES)) {
      const notes = stingNotes(sc);
      const bar = 16 * stepDuration(sc.bpm);
      expect(notes.length, id).toBeGreaterThanOrEqual(4);
      for (const n of notes) {
        expect(sc.scale, `${id} ${n.hz}`).toContain(pitchClass(sc, n.hz));
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at + n.dur).toBeLessThanOrEqual(bar + 1e-9);
      }
      const arp = notes.filter((n) => !n.under);
      for (let i = 1; i < arp.length; i++) expect(arp[i].hz, id).toBeGreaterThan(arp[i - 1].hz);
      const last = arp[arp.length - 1];
      expect(last.top).toBe(true);
      expect(last.hz).toBeCloseTo(midiToFreq(sc.root + 24), 6); // the tonic
    }
  });

  it('beatAt finds the first beat at or after a time on a running grid', () => {
    expect(beatAt(10, 0, 0.1, 10)).toBe(10);
    expect(beatAt(10, 1, 0.1, 10)).toBeCloseTo(10.3, 9); // steps 1 2 3 → 4
    expect(beatAt(10, 0, 0.1, 10.05)).toBeCloseTo(10.4, 9);
    expect(beatAt(10, 2, 0.1, 10.9)).toBeCloseTo(11.0, 9); // step 12
  });

  it('lands only on a new warp that changes the era: never race start, an Endless tier (even mid-warp) or a new race', () => {
    const ctx = new FakeAudioContext();
    const s = createSting(ctx, ctx.createGain());
    expect(s.landed('2026', 0, true)).toBe(false); // first look: race start
    expect(s.landed('1985', 0, true)).toBe(false); // era set without a warp (Endless tier)
    expect(s.landed('1885', 1, true)).toBe(true); // the warp lands in 1885
    for (let i = 0; i < 20; i++) expect(s.landed('1885', 1, true)).toBe(false); // the rest of the warp
    expect(s.landed('2015', 1, true)).toBe(false); // Endless tier-up while the warp is still on
    expect(s.landed('2088', 0, true)).toBe(false); // a new race resets the count
    expect(s.landed('2088', 1, true)).toBe(false); // a warp that did not change era
    expect(s.landed('2026', 2, true)).toBe(true);
    expect(ctx.started.length).toBe(0); // landed() alone never makes a sound
  });

  it('is silent when not playing or the context sleeps, and never fires late', () => {
    const ctx = new FakeAudioContext();
    const s = createSting(ctx, ctx.createGain());
    s.landed('2026', 0, true);
    expect(s.landed('1985', 1, false)).toBe(false); // muted / paused
    expect(s.landed('1985', 1, true)).toBe(false); // unmuted: no catch-up
    ctx.state = 'suspended';
    expect(s.landed('1885', 2, true)).toBe(false);
    ctx.state = 'running';
    expect(s.landed('1885', 2, true)).toBe(false);
  });

  it('the synthwave scheduler plays it once, after the tunnel, on a beat of its grid', () => {
    const state = { playing: true, speed: 100, eraId: '2026', warp: false, warps: 0 };
    const ctx = new FakeAudioContext();
    const sched = createScheduler(ctx, ctx.createGain(), () => state);
    ctx.currentTime = 2; sched.tick();
    const gridStart = ctx.started[0].when; // step 0 of the grid
    ctx.started.length = 0;
    Object.assign(state, { eraId: '1985', warp: true, warps: 1 });
    ctx.currentTime = 2.03; sched.tick();
    expect(sched.stings).toBe(1);
    const sd = stepDuration(ERA_SCORES['1985'].bpm);
    const n = stingNotes(ERA_SCORES['1985']);
    const sting = ctx.started.slice(0, n.length).map((x) => x.when); // queued before the tick's steps
    const t0 = Math.min(...sting);
    expect(t0).toBeGreaterThanOrEqual(2.03 + STING_DELAY - 1e-9);
    expect(t0).toBeLessThan(2.03 + STING_DELAY + 4 * sd + 1e-9);
    // On a beat: whole beats after the grid's start (the 2026 steps before the warp, then 1985 steps).
    const sd0 = stepDuration(ERA_SCORES['2026'].bpm);
    const queued = Math.floor((2 + sched.lookahead - gridStart) / sd0 + 1e-9) + 1; // steps queued at 2026 tempo by the first tick
    const beat = (k) => k % 4 === 0;
    let found = false;
    for (let k = queued; k < queued + 64 && !found; k++) {
      const t = gridStart + queued * sd0 + (k - queued) * sd;
      if (beat(k) && Math.abs(t - t0) < 1e-6) found = true;
    }
    expect(found).toBe(true);
    for (let t = 2.05; t < 5; t += 0.05) { ctx.currentTime = t; sched.tick(); }
    expect(sched.stings).toBe(1);
  });
});
