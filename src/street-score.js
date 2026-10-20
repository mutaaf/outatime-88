// Street score (ticket 0193): original, procedural street-racing music beside the synthwave
// score (src/music.js), and the director that picks between them. A lazy chunk, loaded with the
// music. Every note is synthesized from the pattern tables below: no samples, no vocals, and no
// melody borrowed from any film or record (docs/EASTER_EGGS.md, "Street sound").
//
// Tracks:
//   phonk  drift phonk: a cowbell hook over a distorted, gliding 808, half-time clap, ~140 bpm
//   trap   trap race beat: half-time snare, rolling hats, dark pluck, 808 slides, ~146 bpm
//   edm    big-room race beat: four on the floor, off-beat bass, pumping stabs, 128 bpm
//   build  pre-race tension on the grid: a pulse and a riser that climb to the green light
//   home   a calm loop for the title screen
// The director (createDirector) plays one per bar: the home loop on the title, the build on the
// grid, then synthwave or street by the MUSIC STYLE setting, with intensity layers that rise with
// speed, tier, NOS and the Patrol closing in. Off the road (results, pause) it fades out.

import { ERAS } from './data.js';

const _ = null;

// Steps are sixteenths (16 = one bar). Melodies are scale degrees (7 = an octave up).
export const STREET_TRACKS = {
  phonk: {
    bpm: 140, root: 41, scale: [0, 1, 3, 5, 7, 8, 10], // F phrygian: dark and swaggering
    kick:  [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hat:   [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,1,1,0],
    bell:  [7, _, 8, 7, _, 5, _, 7, 10, _, 8, 7, _, 5, 3, _],
    sub:   [0, _, _, _, _, _, _, 0, _, _, 5, _, _, _, 3, _],
    lead:  null,
  },
  trap: {
    bpm: 146, root: 42, scale: [0, 2, 3, 5, 7, 8, 11], // F# harmonic minor: tense
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hat:   [1,1,1,0, 1,1,1,1, 1,0,1,1, 1,1,1,1],
    bell:  null,
    sub:   [0, _, _, _, _, _, 0, _, _, _, _, _, _, 4, _, 3],
    lead:  [7, _, 9, _, 10, _, 9, 7, _, _, 6, _, 7, _, _, _],
  },
  edm: {
    bpm: 128, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], // A minor
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1],
    bell:  null,
    sub:   [_, _, 0, _, _, _, 0, _, _, _, 5, _, _, _, 4, _],
    lead:  [7, _, _, 7, _, _, 9, _, 10, _, _, 9, _, 7, _, _],
    stab:  true,
  },
  build: {
    bpm: 120, root: 40, scale: [0, 1, 3, 5, 7, 8, 10],
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    bell:  null,
    sub:   [0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _],
    lead:  null,
    riser: true,
  },
  home: {
    bpm: 84, root: 45, scale: [0, 2, 3, 5, 7, 9, 10], // A dorian: easy and warm
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    bell:  null,
    sub:   [0, _, _, _, _, _, _, _, 3, _, _, _, _, _, _, _],
    lead:  [9, _, _, _, 11, _, _, _, 10, _, _, _, 7, _, _, _],
    pad:   true,
  },
};

export const MUSIC_STYLES = ['auto', 'synthwave', 'street'];

// '88-era districts keep the synthwave; the modern and future ones get street beats.
const RETRO_ERAS = new Set(['1985', '1955', '1885']);
const STREET_FOR_ERA = { '2026': 'trap', '2015': 'phonk', '2088': 'edm', '2061': 'edm' };
const ENDLESS_STREET_FROM_TIER = 3;
const ENDLESS_ROTATION = ['phonk', 'trap', 'edm'];

/**
 * synthwave | street for the setting and where you are. AUTO: synthwave in the '88-era
 * districts, street in the modern and future ones, and street in Endless from tier 3 up.
 */
export function resolveStyle(setting, eraId, mode, tier) {
  if (setting === 'synthwave' || setting === 'street') return setting;
  if (mode === 'INFINITE' && (tier || 1) >= ENDLESS_STREET_FROM_TIER) return 'street';
  return RETRO_ERAS.has(String(eraId)) ? 'synthwave' : 'street';
}

/** Which street track: per district, and a new one every Endless tier. */
export function streetTrackFor(eraId, mode, tier) {
  if (mode === 'INFINITE') return ENDLESS_ROTATION[Math.max(0, (tier || 1) - 1) % ENDLESS_ROTATION.length];
  return STREET_FOR_ERA[String(eraId)] || 'phonk';
}

/** What the director should play: 'home' | 'build' | 'synthwave' | a street track | null (silence). */
export function cueFor(s) {
  if (!s || s.muted) return null;
  if (s.status === 'TITLE') return 'home';
  if (s.status !== 'PLAYING') return null;
  if (s.racePhase === 'START') return 'build';
  if (s.racePhase === 'FINISHED') return null; // the flag: fade out under the results
  if (resolveStyle(s.style, s.eraId, s.mode, s.tier) === 'synthwave') return 'synthwave';
  return streetTrackFor(s.eraId, s.mode, s.tier);
}

/** Intensity 0..1 from speed (mph), Endless tier, NOS and the Patrol closing in. */
export function intensityFor({ speed = 0, tier = 1, nos = false, patrol = false, warp = false } = {}) {
  let k = Math.min(1, Math.max(0, speed) / 130) * 0.65 + Math.min(1, Math.max(0, (tier || 1) - 1) / 8) * 0.2;
  if (nos) k += 0.25;
  if (patrol) k += 0.3;
  if (warp) k = 1;
  return Math.max(0, Math.min(1, k));
}

/** Which layers play at an intensity. Drums always; a full track at the top. */
export function layersAt(k) {
  return { drums: true, sub: k >= 0.15, hook: k >= 0.4, hats: k >= 0.3, rolls: k >= 0.7, lift: k >= 0.85 };
}

export const stepSeconds = (bpm) => 60 / bpm / 4;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function degreeHz(tr, degree, octave) {
  const n = tr.scale.length;
  const oct = Math.floor(degree / n) + octave;
  return midi(tr.root + tr.scale[((degree % n) + n) % n] + 12 * oct);
}

/**
 * The music director. `synth` is src/music.js (its scheduler plays the synthwave cue).
 * getState() → { status, racePhase, muted, style, eraId, mode, tier, speed, nos, patrol, warp }.
 */
export function createDirector(ctx, out, getState, synth) {
  const lookahead = 0.12;
  let nextTime = 0;
  let step = 0;
  let cue = null;
  let base = null;
  let fading = 0; // audio-clock time the fade-out ends (the old cue plays on under it till then)
  // The synthwave scheduler only plays while it's the cue.
  const synthSched = synth ? synth.createScheduler(ctx, out, () => {
    const s = base || {};
    return { playing: cue === 'synthwave', speed: s.speed || 0, eraId: s.eraId, warp: Boolean(s.warp) };
  }) : null;

  // Street voices go through one stage, level-matched to the synthwave score (rendered offline:
  // racing cues sit ~6 dB under their raw sum; the home loop plays as written).
  const mix = ctx.createGain();
  mix.connect(out);
  const MIX = { home: 1, build: 0.6 };

  let noise = null;
  function noiseBuf() {
    if (!noise) {
      const n = Math.floor(ctx.sampleRate * 0.5);
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let s = 987654321;
      for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
    }
    return noise;
  }
  let shaper = null;
  function drive() {
    if (!shaper && typeof ctx.createWaveShaper === 'function') {
      shaper = ctx.createWaveShaper();
      const n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 3.2) * 0.8; }
      shaper.curve = c;
      shaper.connect(mix);
    }
    return shaper || mix;
  }
  function env(g, when, peak, dur, attack = 0.005) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  }
  function osc(type, hz, when, dur, peak, dest = mix, glideTo = 0, attack = 0.005, cutoff = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, when);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, when + dur * 0.6);
    const g = ctx.createGain();
    env(g, when, peak, dur, attack);
    if (cutoff) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, when);
      o.connect(f); f.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(when); o.stop(when + dur + 0.03);
  }
  function hiss(when, dur, peak, type, hz, hz2 = 0) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(hz, when);
    if (hz2) f.frequency.exponentialRampToValueAtTime(hz2, when + dur);
    const g = ctx.createGain(); env(g, when, peak, dur, type === 'bandpass' && hz2 ? dur * 0.9 : 0.002);
    s.connect(f); f.connect(g); g.connect(mix);
    s.start(when); s.stop(when + dur + 0.03);
  }
  function kick(when, peak = 0.5) { osc('sine', 160, when, 0.3, peak, mix, 40, 0.002); }
  function clap(when) { for (let i = 0; i < 3; i++) hiss(when + i * 0.011, 0.14 - i * 0.03, 0.16, 'bandpass', 1500); }
  /** The classic two-square bell, original pattern; pitched to the scale. */
  function bell(when, hz, dur) {
    osc('square', hz, when, dur, 0.05, mix, 0, 0.002, 2600);
    osc('square', hz * 1.48, when, dur, 0.035, mix, 0, 0.002, 2600);
  }

  function playStep(i, when, tr, k, name) {
    const L = layersAt(name === 'home' ? 0.5 : k);
    const sd = stepSeconds(tr.bpm);
    const homeQuiet = name === 'home' ? 0.45 : 1;
    if (tr.kick[i]) kick(when, (name === 'home' ? 0.22 : 0.5) * (name === 'build' ? 0.5 + Math.min(1, step / 64) * 0.5 : 1));
    if (tr.clap[i]) clap(when);
    if (tr.hat[i] && (L.hats || name === 'build' || name === 'home')) hiss(when, 0.035, 0.05 * homeQuiet, 'highpass', 8000);
    if (L.rolls && name !== 'home' && (i === 14 || i === 15)) {
      hiss(when + sd / 3, 0.025, 0.04, 'highpass', 9000);
      hiss(when + (2 * sd) / 3, 0.025, 0.04, 'highpass', 9000);
    }
    if (L.sub && tr.sub[i] !== null) {
      const hz = degreeHz(tr, tr.sub[i], -2);
      // The 808: a sine pushed through soft clipping, sliding in from above.
      const glide = name === 'phonk' || name === 'trap';
      osc('sine', glide ? hz * 1.5 : hz, when, sd * (name === 'home' ? 6 : 3.5), (name === 'home' ? 0.12 : 0.3), name === 'home' ? mix : drive(), glide ? hz : 0, 0.003);
    }
    if (L.hook && tr.bell && tr.bell[i] !== null) bell(when, degreeHz(tr, tr.bell[i], 1), sd * 1.6);
    if (L.hook && tr.lead && tr.lead[i] !== null) {
      const hz = degreeHz(tr, tr.lead[i], name === 'home' ? 0 : 1);
      if (name === 'home') osc('triangle', hz, when, sd * 6, 0.04, mix, 0, 0.08, 1400);
      else osc(name === 'edm' ? 'sawtooth' : 'triangle', hz, when, sd * (name === 'edm' ? 1.4 : 1.1), 0.045, mix, 0, 0.003, 3200);
    }
    if (tr.stab && L.lift && i % 4 === 2) {
      for (const d of [0, 2, 4]) osc('sawtooth', degreeHz(tr, d, 0), when, sd * 1.2, 0.025, mix, 0, 0.004, 2400);
    }
    if (tr.pad && i === 0) for (const d of [0, 2, 4]) osc('triangle', degreeHz(tr, d, 0), when, sd * 16, 0.02, mix, 0, 0.6, 900);
    if (tr.riser && i === 0) hiss(when, sd * 16, 0.06 + Math.min(1, step / 64) * 0.08, 'bandpass', 300, 5000);
  }

  return {
    lookahead,
    get cue() { return cue; },
    tick() {
      const now = ctx.currentTime;
      base = getState();
      if (nextTime < now) nextTime = now;
      const want = cueFor(base);
      const g = out && out.gain;
      if (want === null && cue !== null && !fading) {
        // Off the road (results, pause, muted): fade out over ~1.5 s rather than cut.
        fading = now + 1.6;
        if (g) { g.cancelScheduledValues(now); g.setTargetAtTime(0.0001, now, 0.4); }
      }
      if (fading && (want !== null || now >= fading)) {
        if (want !== null && g) { g.cancelScheduledValues(now); g.setTargetAtTime(1, now, 0.05); }
        if (want === null) { cue = null; step = 0; }
        fading = 0;
      }
      // Switch on a bar line (or at once from silence), so a beat never stutters mid-bar.
      if (want !== null && want !== cue && (cue === null || cue === 'synthwave' || step % 16 === 0)) {
        if (want === 'synthwave' && synthSched) synthSched.reset();
        if (cue === null && g) { g.cancelScheduledValues(now); g.setTargetAtTime(1, now, 0.05); } // back up after a fade
        cue = want;
        step = 0;
        mix.gain.setValueAtTime(MIX[cue] || 0.5, now);
      }
      if (cue === 'synthwave') { if (synthSched) synthSched.tick(); nextTime = now; return; }
      if (!cue) { nextTime = now; return; }
      const tr = STREET_TRACKS[cue];
      const k = intensityFor(base);
      const sd = stepSeconds(tr.bpm);
      while (nextTime <= now + lookahead) {
        playStep(step % 16, nextTime, tr, k, cue);
        nextTime += sd;
        step++;
      }
    },
    reset() {
      step = 0; nextTime = 0; cue = null; fading = 0;
      if (out && out.gain) out.gain.setValueAtTime(1, ctx.currentTime);
      if (synthSched) synthSched.reset();
    },
  };
}

/**
 * The game's music: the mood-filter and ducking chain into the music bus, and the director on
 * the game's state (src/audio.js calls this once, with the SoundEngine and src/music.js).
 */
export function createMusic(se, G, synth) {
  const ctx = se.ctx;
  const inG = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(20000, ctx.currentTime);
  const duck = ctx.createGain();
  inG.connect(lp); lp.connect(duck); duck.connect(se.musicBus);
  se.musicIn = inG; se.musicLP = lp; se.musicDuck = duck;
  const s = { status: '', racePhase: '', muted: false, style: 'auto', eraId: '', mode: '', tier: 1, speed: 0, nos: false, patrol: false, warp: false };
  return createDirector(ctx, inG, () => {
    s.status = G.status; s.racePhase = G.racePhase; s.muted = se.muted; s.style = se.musicStyle;
    s.eraId = (ERAS[G.eraIndex] || ERAS[0]).id; s.mode = G.mode; s.tier = G.tier || 1; s.speed = G.speed || 0;
    s.nos = Boolean(G.nosBurning); s.patrol = Boolean(G.patrolOn); s.warp = G.warpActiveTimer > 0;
    return s;
  }, synth);
}
