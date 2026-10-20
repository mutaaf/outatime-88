// The street score and the music director (ticket 0193).
import { describe, it, expect } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';
import {
  STREET_TRACKS, MUSIC_STYLES, resolveStyle, streetTrackFor, cueFor, intensityFor, layersAt, stepSeconds, degreeHz, createDirector,
} from '../../src/street-score.js';
import * as synth from '../../src/music.js';
import { ERAS } from '../../src/data.js';

describe('street tracks', () => {
  it('every pattern is one bar of sixteenths, with notes inside the scale range', () => {
    for (const [name, tr] of Object.entries(STREET_TRACKS)) {
      for (const k of ['kick', 'clap', 'hat', 'sub']) expect(tr[k], `${name}.${k}`).toHaveLength(16);
      for (const k of ['bell', 'lead']) if (tr[k]) expect(tr[k], `${name}.${k}`).toHaveLength(16);
      for (const k of ['sub', 'bell', 'lead']) for (const d of tr[k] || []) if (d !== null) expect(Number.isInteger(d) && d >= 0 && d < 21).toBe(true);
      expect(tr.bpm).toBeGreaterThan(60);
      expect(degreeHz(tr, 0, 0)).toBeGreaterThan(80);
    }
    expect(STREET_TRACKS.phonk.bpm).toBeGreaterThanOrEqual(135);
    expect(STREET_TRACKS.phonk.bell).toBeTruthy(); // the cowbell hook
    expect(STREET_TRACKS.edm.kick.filter(Boolean)).toHaveLength(4); // four on the floor
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });
});

describe('music style', () => {
  it('AUTO: synthwave in the 88-era districts, street in modern and future ones', () => {
    expect(resolveStyle('auto', '1985', 'ARCADE', 1)).toBe('synthwave');
    expect(resolveStyle('auto', '1955', 'ARCADE', 1)).toBe('synthwave');
    expect(resolveStyle('auto', '1885', 'ARCADE', 1)).toBe('synthwave');
    expect(resolveStyle('auto', '2015', 'ARCADE', 1)).toBe('street');
    expect(resolveStyle('auto', '2088', 'ARCADE', 1)).toBe('street');
    expect(resolveStyle('auto', '2061', 'ARCADE', 1)).toBe('street');
  });
  it('AUTO: Endless goes street from tier 3 even in a retro era', () => {
    expect(resolveStyle('auto', '1985', 'INFINITE', 2)).toBe('synthwave');
    expect(resolveStyle('auto', '1985', 'INFINITE', 3)).toBe('street');
  });
  it('SYNTHWAVE and STREET force it everywhere', () => {
    for (const e of ERAS) {
      expect(resolveStyle('synthwave', e.id, 'INFINITE', 9)).toBe('synthwave');
      expect(resolveStyle('street', e.id, 'ARCADE', 1)).toBe('street');
    }
    expect(MUSIC_STYLES).toEqual(['auto', 'synthwave', 'street']);
  });
  it('a new street track every Endless tier, one per district elsewhere', () => {
    expect(streetTrackFor('2026', 'INFINITE', 3)).not.toBe(streetTrackFor('2026', 'INFINITE', 4));
    for (const e of ERAS) expect(STREET_TRACKS[streetTrackFor(e.id, 'ARCADE', 1)]).toBeTruthy();
  });
});

describe('cues', () => {
  const base = { status: 'PLAYING', racePhase: 'RACING', style: 'street', eraId: '2026', mode: 'ARCADE', tier: 1 };
  it('home loop on the title, the build on the grid, silence on the results and when muted', () => {
    expect(cueFor({ ...base, status: 'TITLE' })).toBe('home');
    expect(cueFor({ ...base, racePhase: 'START' })).toBe('build');
    expect(cueFor({ ...base, racePhase: 'FINISHED' })).toBeNull();
    expect(cueFor({ ...base, status: 'GAMEOVER' })).toBeNull();
    expect(cueFor({ ...base, status: 'PAUSED' })).toBeNull();
    expect(cueFor({ ...base, muted: true })).toBeNull();
    expect(cueFor({ ...base, style: 'synthwave' })).toBe('synthwave');
    expect(cueFor(base)).toBe('trap');
  });
  it('intensity rises with speed, tier, NOS and the Patrol, and opens the layers', () => {
    const calm = intensityFor({ speed: 30 });
    expect(intensityFor({ speed: 120 })).toBeGreaterThan(calm);
    expect(intensityFor({ speed: 30, tier: 8 })).toBeGreaterThan(calm);
    expect(intensityFor({ speed: 30, nos: true })).toBeGreaterThan(calm);
    expect(intensityFor({ speed: 30, patrol: true })).toBeGreaterThan(calm);
    expect(intensityFor({ warp: true })).toBe(1);
    expect(layersAt(0).hook).toBe(false);
    expect(layersAt(1)).toEqual({ drums: true, sub: true, hook: true, hats: true, rolls: true, lift: true });
  });
});

describe('director', () => {
  function rig(state) {
    const ctx = new FakeAudioContext();
    const out = ctx.createGain();
    const d = createDirector(ctx, out, () => state, synth);
    return { ctx, out, d };
  }
  const tick = (r, n = 1) => { for (let i = 0; i < n; i++) { r.ctx.currentTime += 0.05; r.d.tick(); } };

  it('plays the home loop on the title, then the build on the grid, then the race track on a bar line', () => {
    const state = { status: 'TITLE', style: 'street', eraId: '2026', mode: 'INFINITE', tier: 3, speed: 0 };
    const r = rig(state);
    tick(r);
    expect(r.d.cue).toBe('home');
    expect(r.ctx.started.length).toBeGreaterThan(0);
    Object.assign(state, { status: 'PLAYING', racePhase: 'START' });
    r.d.reset();
    tick(r);
    expect(r.d.cue).toBe('build');
    state.racePhase = 'RACING';
    state.speed = 100;
    tick(r, 60); // ≥ one bar at 120 bpm
    expect(r.d.cue).toBe('edm'); // Endless tier 3's track
  });

  it('hands the synthwave cue to the synthwave scheduler', () => {
    const state = { status: 'PLAYING', racePhase: 'RACING', style: 'synthwave', eraId: '1985', mode: 'ARCADE', tier: 1, speed: 90 };
    const r = rig(state);
    tick(r, 4);
    expect(r.d.cue).toBe('synthwave');
    expect(r.ctx.started.length).toBeGreaterThan(0); // the synthwave scheduler is playing
  });

  it('fades out on the results instead of cutting, and comes back up for the next race', () => {
    const state = { status: 'PLAYING', racePhase: 'RACING', style: 'street', eraId: '2015', mode: 'ARCADE', tier: 1, speed: 90 };
    const r = rig(state);
    tick(r, 4);
    state.racePhase = 'FINISHED';
    tick(r);
    expect(r.out.gain.events.some((e) => e[0] === 'target' && e[1] < 0.01)).toBe(true);
    tick(r, 40); // past the 1.6 s fade
    expect(r.d.cue).toBeNull();
    const n = r.ctx.started.length;
    tick(r, 5);
    expect(r.ctx.started.length).toBe(n); // silent
    state.racePhase = 'RACING';
    tick(r);
    expect(r.d.cue).toBe('phonk');
    expect(r.out.gain.events[r.out.gain.events.length - 1][1]).toBe(1);
  });
});
