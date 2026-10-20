// The street-tuner layer (ticket 0193) on a fake Web Audio graph: what each moment builds.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';
import { createTuner } from '../../src/sfx/tuner.js';

function rig() {
  const ctx = new FakeAudioContext();
  const g = () => ctx.createGain();
  const se = {
    muted: false, volume: 0.8, sfxMix: 1,
    sfxBus: g(), engineBus: g(), compressor: ctx.createDynamicsCompressor(),
    musicLP: ctx.createBiquadFilter(), musicDuck: g(),
  };
  const tuner = createTuner(ctx, se);
  const G = {
    status: 'PLAYING', racePhase: 'RACING', speed: 80, rpm: 70, gear: 3, throttle: true, nosBurning: false,
    tyreSlip: 0, isDrifting: false, driftTier: 0, playerX: 0, playerY: 0, dodgeStreak: 0, takedownSlowMoTimer: 0, mode: 'INFINITE',
  };
  const bodies = [];
  const world = { bodies: () => bodies, playerZ: () => 10000, seg: () => ({ trackType: 'STANDARD' }) };
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.currentTime += 1 / 60; tuner.frame(G, true, world); } };
  return { ctx, se, tuner, G, bodies, world, step };
}
const last = (p) => p.events[p.events.length - 1][1];

beforeEach(() => { vi.useFakeTimers(); });

describe('tuner layer', () => {
  it('builds its voices on the first racing frame and then allocates nothing in steady state', () => {
    const r = rig();
    r.tuner.setCharacter('MUSCLE', 'Brawler');
    r.G.throttle = true; r.G.rpm = 70;
    r.step(2);
    const n = r.ctx.nodes.length;
    r.step(30);
    expect(r.ctx.nodes.length).toBe(n);
  });

  it('a turbo car whistles under load; a V8 does not', () => {
    const t = rig();
    t.tuner.setCharacter('TUNER_WING', 'Street Legend');
    t.G.rpm = 95;
    t.step(60);
    const spoolGain = t.ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(t.se.engineBus));
    expect(last(spoolGain.gain)).toBeGreaterThan(0.01);
    const v = rig();
    v.tuner.setCharacter('MUSCLE');
    v.G.rpm = 95;
    v.step(60);
    const vg = v.ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(v.se.engineBus));
    expect(last(vg.gain)).toBe(0);
  });

  it('lifting off with boost vents the blow-off valve and crackles on the overrun', () => {
    const r = rig();
    r.tuner.setCharacter('TUNER_WING');
    r.G.rpm = 95;
    r.step(60);
    const before = r.ctx.started.length;
    r.G.throttle = false;
    r.step(45);
    expect(r.ctx.started.length - before).toBeGreaterThan(4); // the valve (2) + pops (2 each)
  });

  it('NOS: click, hiss and roar on open with the music ducked and closed down; a purge puff on close', () => {
    const r = rig();
    r.step(2);
    const before = r.ctx.started.length;
    r.G.nosBurning = true;
    r.step(1);
    expect(r.ctx.started.length - before).toBeGreaterThanOrEqual(3);
    expect(last(r.se.musicDuck.gain)).toBe(1); // ducks, then the scheduled recovery
    expect(r.se.musicDuck.gain.events.some((e) => e[0] === 'target' && e[1] < 0.7)).toBe(true);
    expect(last(r.se.musicLP.frequency)).toBeLessThan(2000);
    const mid = r.ctx.started.length;
    r.G.nosBurning = false;
    r.step(1);
    expect(r.ctx.started.length).toBeGreaterThan(mid);
    r.step(1);
    expect(last(r.se.musicLP.frequency)).toBe(20000);
  });

  it('a car rushing past gets a Doppler pass-by; a far-lane one does not', () => {
    const r = rig();
    const near = { kind: 'TRAFFIC', worldZ: 10040, offset: 0.2, mph: 30 };
    const far = { kind: 'TRAFFIC', worldZ: 10040, offset: 1.5, mph: 30 };
    r.bodies.push(near, far);
    r.step(1);
    const before = r.ctx.started.length;
    near.worldZ = far.worldZ = 9960; // you've passed them both
    r.step(1);
    expect(r.ctx.started.length - before).toBe(2); // one noise sweep + one tone, for the near car only
  });

  it('tunnels open the reverb send', () => {
    const r = rig();
    r.world.seg = () => ({ trackType: 'BOOSTER' });
    r.step(3);
    const send = r.ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.some((o) => o.kind === 'convolver'));
    expect(last(send.gain)).toBeGreaterThan(0.2);
  });

  it('metal crunch: bigger hits start more voices; tiny taps start none', () => {
    const r = rig();
    const a = r.ctx.started.length;
    r.tuner.crunch(10);
    expect(r.ctx.started.length).toBe(a);
    r.tuner.crunch(1800);
    expect(r.ctx.started.length - a).toBeGreaterThanOrEqual(7); // crunch + two rings + glass
  });

  it('big air and slow-mo drop the bass once each', () => {
    const r = rig();
    r.step(1);
    let n = r.ctx.started.length;
    r.G.playerY = 30;
    r.step(40); // 0.66 s of air
    expect(r.ctx.started.length - n).toBe(3);
    n = r.ctx.started.length;
    r.G.playerY = 0;
    r.G.takedownSlowMoTimer = 1;
    r.step(3);
    expect(r.ctx.started.length - n).toBe(3);
  });

  it('muted: no one-shots at all', () => {
    const r = rig();
    r.se.muted = true;
    r.step(1);
    const n = r.ctx.started.length;
    r.G.nosBurning = true;
    r.step(1);
    r.tuner.crunch(1600);
    r.tuner.beep(true);
    expect(r.ctx.started.length).toBe(n);
  });

  it('off the road it fades its voices, and a run ending plays the run-over stinger', () => {
    const r = rig();
    r.step(5);
    const n = r.ctx.started.length;
    r.G.status = 'GAMEOVER';
    r.ctx.currentTime += 1 / 60;
    r.tuner.frame(r.G, false, r.world);
    expect(r.ctx.started.length - n).toBe(3);
    expect(last(r.se.musicLP.frequency)).toBe(20000);
  });

  it('caps one-shots alive at once', () => {
    const r = rig();
    for (let i = 0; i < 40; i++) r.tuner.crunch(1600);
    expect(r.tuner.live).toBeLessThanOrEqual(14);
    vi.advanceTimersByTime(3000);
    expect(r.tuner.live).toBe(0);
  });
});
