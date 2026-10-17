import { describe, it, expect } from 'vitest';
import { ERA_SCORES, DEFAULT_SCORE, scoreFor, layersFor, stepDuration, noteFreq, createScheduler } from '../../src/music.js';
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
