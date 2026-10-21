// Slipstream charge cue (ticket 0197): the mapping, the edge tint, and the tone in the tuner layer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';
import { draftCue, wakeFrame, DRAFT_READY, TONE_LO, TONE_HI, PULSE_HZ, TINT_FADE } from '../../src/slipstream.js';
import { createTuner } from '../../src/sfx/tuner.js';

describe('draftCue', () => {
  it('is off, silent and still when not drafting, whatever the charge', () => {
    for (const charge of [0, 50, 100]) {
      const c = draftCue(false, charge, false, 1.3);
      expect(c).toMatchObject({ on: false, hz: 0, gain: 0, lines: 0, tint: 0, pulse: 0, ready: false });
    }
  });

  it('maps charge 0..100 to a monotonic pitch, level, line intensity and tint', () => {
    let prev = null;
    for (let charge = 0; charge <= 100; charge += 5) {
      const c = { ...draftCue(true, charge, false, 0) };
      expect(c.on).toBe(true);
      if (prev) {
        expect(c.hz).toBeGreaterThan(prev.hz);
        expect(c.gain).toBeGreaterThan(prev.gain);
        expect(c.lines).toBeGreaterThan(prev.lines);
        expect(c.tint).toBeGreaterThan(prev.tint);
      }
      prev = c;
    }
    expect(draftCue(true, 0, false, 0).hz).toBeCloseTo(TONE_LO);
    expect(draftCue(true, 100, false, 0).hz).toBeCloseTo(TONE_HI);
    expect(draftCue(true, 100, false, 0).lines).toBeLessThanOrEqual(1);
    expect(draftCue(true, 250, false, 0).hz).toBeCloseTo(TONE_HI); // clamped
  });

  it('is READY from 80% and only then pulses, at a safe rate', () => {
    expect(draftCue(true, DRAFT_READY - 1, false, 0.125).ready).toBe(false);
    expect(draftCue(true, DRAFT_READY - 1, false, 0.125).pulse).toBe(0);
    expect(draftCue(true, DRAFT_READY, false, 0).ready).toBe(true);
    expect(PULSE_HZ).toBeLessThanOrEqual(3); // ticket 0188: no more than 3 flashes a second
    const seen = new Set();
    for (let t = 0; t < 1; t += 0.05) seen.add(Math.round(draftCue(true, 90, false, t).pulse * 10));
    expect(seen.size).toBeGreaterThan(3); // it moves
  });

  it('calm mode keeps the sound and a static tint: no lines, no pulse', () => {
    const calm = { ...draftCue(true, 90, true, 0.125) };
    const full = draftCue(true, 90, false, 0.125);
    expect(calm.hz).toBeCloseTo(full.hz);
    expect(calm.gain).toBeCloseTo(full.gain);
    expect(calm.tint).toBeCloseTo(full.tint);
    expect(calm.lines).toBe(0);
    for (let t = 0; t < 1; t += 0.05) expect(draftCue(true, 95, true, t).pulse).toBe(0);
  });

  it('reuses the object it is given', () => {
    const out = {};
    expect(draftCue(true, 40, false, 0, out)).toBe(out);
    expect(draftCue(false, 40, false, 0, out)).toBe(out);
  });
});

describe('wakeFrame (the edge tint)', () => {
  function fakeCanvas() {
    const calls = { fills: 0, gradients: 0, alpha: [] };
    const c = {
      globalAlpha: 1, fillStyle: null,
      save() {}, restore() {},
      createRadialGradient() { calls.gradients++; return { addColorStop() {} }; },
      fillRect() { calls.fills++; calls.alpha.push(this.globalAlpha); },
    };
    return { c, calls };
  }
  const G = (o) => ({ status: 'PLAYING', draftingCar: {}, speed: 80, draftCharge: 50, reducedMotion: false, ...o });

  it('draws nothing out of a wake, below 50 mph or off the road', () => {
    const { c, calls } = fakeCanvas();
    for (const g of [G({ draftingCar: null }), G({ speed: 40 }), G({ status: 'PAUSED' })]) {
      expect(wakeFrame(c, 1280, 720, g, 0).on).toBe(false);
    }
    expect(calls.fills).toBe(0);
  });

  it('tints the edges in a wake, publishes the cue, and builds its gradient once per size', () => {
    const { c, calls } = fakeCanvas();
    const g = G({ draftCharge: 90 });
    for (let i = 0; i < 30; i++) wakeFrame(c, 1280, 720, g, i / 60);
    expect(calls.fills).toBeGreaterThanOrEqual(29); // the first frame starts the fade-in
    expect(calls.gradients).toBe(1);
    expect(g.wakeCue.on).toBe(true);
    expect(g.wakeCue.ready).toBe(true);
    wakeFrame(c, 390, 844, g, 0);
    expect(calls.gradients).toBe(2);
  });

  it('holds a steady tint in calm mode, whatever the charge', () => {
    const { c, calls } = fakeCanvas();
    const g = G({ reducedMotion: true });
    for (let i = 0; i < 60; i++) { g.draftCharge = 20 + i; wakeFrame(c, 1280, 720, g, 10 + i / 60); }
    expect(new Set(calls.alpha.slice(-40)).size).toBe(1); // after the fade-in
  });

  it('a wake that flickers on and off every frame never flashes the screen', () => {
    const { c, calls } = fakeCanvas();
    const g = G({ draftCharge: 95, draftingCar: null });
    for (let i = 0; i < 30; i++) wakeFrame(c, 1280, 720, g, 20 + i / 60); // settle: no tint
    for (let i = 30; i < 150; i++) { g.draftingCar = i % 2 ? null : {}; wakeFrame(c, 1280, 720, g, 20 + i / 60); }
    const maxA = 0.08 + 0.2 + 0.1;
    let prev = 0, worst = 0;
    for (const a of calls.alpha) { worst = Math.max(worst, Math.abs(a - prev)); prev = a; }
    expect(worst).toBeLessThanOrEqual(maxA * (1 / 60) / TINT_FADE + 0.11); // the fade, plus the 2 Hz swell
  });

  it('fades the tint out over TINT_FADE after the wake ends', () => {
    const { c, calls } = fakeCanvas();
    const g = G({ draftCharge: 50 });
    for (let i = 0; i < 30; i++) wakeFrame(c, 1280, 720, g, 30 + i / 60);
    g.draftingCar = null;
    const n = calls.fills;
    for (let i = 30; i < 60; i++) wakeFrame(c, 1280, 720, g, 30 + i / 60);
    const tail = calls.fills - n;
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThanOrEqual(Math.ceil(TINT_FADE * 60));
  });
});

describe('the slipstream tone (tuner layer)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  function rig(muted = false) {
    const ctx = new FakeAudioContext();
    const g = () => ctx.createGain();
    const se = {
      muted, volume: 0.8, sfxMix: 1,
      sfxBus: g(), engineBus: g(), compressor: ctx.createDynamicsCompressor(),
      musicLP: ctx.createBiquadFilter(), musicDuck: g(),
    };
    const tuner = createTuner(ctx, se);
    const G = {
      status: 'PLAYING', racePhase: 'RACING', speed: 80, rpm: 60, gear: 3, throttle: true, nosBurning: false,
      tyreSlip: 0, isDrifting: false, driftTier: 0, playerX: 0, playerY: 0, dodgeStreak: 0, takedownSlowMoTimer: 0,
      draftingCar: null, draftCharge: 0, reducedMotion: false,
    };
    const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.currentTime += 1 / 60; tuner.frame(G, true, null); } };
    return { ctx, se, tuner, G, step };
  }
  const oscs = (ctx) => ctx.started.filter((s) => s.node.kind === 'osc').length;

  it('starts only in a wake, rises with the charge, and fades within 200 ms of leaving it', () => {
    const r = rig();
    r.step(10);
    expect(r.tuner.st.draftOn).toBe(false);
    expect(r.tuner.st.draftStarts).toBe(0);
    r.G.draftingCar = {};
    r.G.draftCharge = 20;
    r.step(2);
    expect(r.tuner.st.draftOn).toBe(true);
    expect(r.tuner.st.draftStarts).toBe(1);
    const low = r.tuner.st.draftHz;
    r.G.draftCharge = 70;
    r.step(2);
    expect(r.tuner.st.draftHz).toBeGreaterThan(low);
    expect(r.tuner.st.draftStarts).toBe(1); // one voice for the whole wake

    const voice = r.ctx.nodes.filter((n) => n.kind === 'osc' && n.type === 'triangle').pop();
    const gain = voice.outputs[0];
    const stop = vi.spyOn(voice, 'stop');
    r.G.draftingCar = null;
    const left = r.ctx.currentTime;
    let n = 0;
    while (r.tuner.st.draftOn && n < 60) { r.step(1); n++; }
    expect(r.tuner.st.draftOn).toBe(false);
    const ev = gain.gain.events[gain.gain.events.length - 1];
    expect(ev[0]).toBe('target');
    expect(ev[1]).toBe(0);
    expect(Math.exp(-0.2 / ev[3])).toBeLessThan(0.01); // < 1% of its level by 200 ms
    expect(stop).toHaveBeenCalled();
    expect(stop.mock.calls[0][0] - left).toBeLessThanOrEqual(0.2);
  });

  it('a wake that drops out for a frame keeps one voice; every voice made is stopped', () => {
    const r = rig();
    r.step(2); // the layer's own continuous voices are built first
    const made = [];
    const mk = r.ctx.createOscillator.bind(r.ctx);
    r.ctx.createOscillator = () => { const o = mk(); o.stopped = 0; o.stop = () => { o.stopped++; }; made.push(o); return o; };
    r.G.draftCharge = 50;
    for (let i = 0; i < 40; i++) { r.G.draftingCar = i % 3 === 2 ? null : {}; r.step(1); }
    expect(r.tuner.st.draftStarts).toBe(1);
    for (let cycle = 0; cycle < 3; cycle++) {
      r.G.draftingCar = null; r.step(20);
      r.G.draftingCar = {}; r.step(10);
    }
    r.G.draftingCar = null; r.step(20);
    expect(r.tuner.st.draftStarts).toBe(4);
    expect(made.length).toBe(8); // two oscillators per voice
    for (const o of made) expect(o.stopped).toBe(1);
  });

  it('turning the volume down mid-wake drops the tone at once', () => {
    const r = rig();
    r.G.draftingCar = {}; r.G.draftCharge = 50;
    r.step(5);
    expect(r.tuner.st.draftOn).toBe(true);
    r.se.volume = 0;
    r.step(1);
    expect(r.tuner.st.draftOn).toBe(false);
    r.step(10);
    expect(r.tuner.st.draftStarts).toBe(1);
  });

  it('ticks from READY until the slingshot fires', () => {
    const r = rig();
    r.G.draftingCar = {};
    r.G.draftCharge = 60;
    r.step(30);
    expect(r.tuner.st.draftTicks).toBe(0);
    r.G.draftCharge = 90;
    r.step(30); // half a second
    expect(r.tuner.st.draftTicks).toBeGreaterThanOrEqual(2);
    expect(r.tuner.st.draftTicks).toBeLessThanOrEqual(3);
  });

  it('muted: no slipstream oscillator is ever started', () => {
    const r = rig(true);
    r.step(2);
    const before = oscs(r.ctx);
    r.G.draftingCar = {};
    r.G.draftCharge = 95;
    r.step(30);
    expect(r.tuner.st.draftStarts).toBe(0);
    expect(r.tuner.st.draftTicks).toBe(0);
    expect(oscs(r.ctx)).toBe(before);
  });

  it('stops the tone when the race stops', () => {
    const r = rig();
    r.G.draftingCar = {};
    r.G.draftCharge = 50;
    r.step(3);
    expect(r.tuner.st.draftOn).toBe(true);
    r.ctx.currentTime += 1 / 60;
    r.tuner.frame(r.G, false, null);
    expect(r.tuner.st.draftOn).toBe(false);
  });
});
