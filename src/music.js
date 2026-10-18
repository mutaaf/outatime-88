// Procedural synthwave score (pillar 4). Pure pattern tables + a lookahead scheduler that
// queues notes on the AudioContext clock ("A Tale of Two Clocks"), so timing stays tight even
// when the main thread hitches. Layers stack with speed so the run-up to 88 *sounds* like a
// climax. Everything is synthesized: no samples, no network.

// Pattern grammar (16 steps = one bar of sixteenths):
//   bass/arp/lead: scale degree (0 = root; 7 = root an octave up) or null for a rest
//   drums: 1 = hit, 0 = rest
const _ = null;

export const ERA_SCORES = {
  // Present-day neon: classic minor-key synthwave, driving eighths.
  '2026': {
    bpm: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], wave: 'sawtooth',
    bass: [0, _, 0, _, 0, _, 0, 2, 5, _, 5, _, 4, _, 4, 3],
    arp:  [7, 9, 11, 9, 7, 9, 11, 14, 12, 11, 9, 11, 12, 11, 9, 8],
    lead: [14, _, _, 13, 14, _, 16, _, 15, _, 14, _, 12, _, 11, _],
    drums: { kick: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1], hat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0] },
  },
  // The 80s: brighter dorian, square-wave chip lead, gated snare feel.
  '1985': {
    bpm: 118, root: 43, scale: [0, 2, 3, 5, 7, 9, 10], wave: 'square',
    bass: [0, 0, 7, 0, 0, 0, 7, 0, 3, 3, 10, 3, 4, 4, 11, 4],
    arp:  [7, 11, 14, 11, 7, 11, 14, 16, 10, 14, 17, 14, 11, 14, 18, 14],
    lead: [14, _, 16, _, 17, _, 16, 14, _, _, 12, _, 14, _, _, _],
    drums: { kick: [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1] },
  },
  // Frontier: slower, harmonic-minor twang over a gallop.
  '1885': {
    bpm: 96, root: 40, scale: [0, 2, 3, 5, 7, 8, 11], wave: 'triangle',
    bass: [0, _, _, 0, 4, _, _, 4, 3, _, _, 3, 4, _, 6, _],
    arp:  [7, 9, 10, 9, 11, 10, 9, 7, 10, 9, 7, 6, 7, _, 11, _],
    lead: [14, _, 13, 14, 16, _, 14, _, 13, _, 11, _, 14, _, _, _],
    drums: { kick: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1] },
  },
  // Sky-highway future: major/lydian lift, fast sparkling arps.
  '2015': {
    bpm: 128, root: 48, scale: [0, 2, 4, 6, 7, 9, 11], wave: 'sawtooth',
    bass: [0, _, 0, 0, _, 0, 0, _, 5, _, 5, 5, _, 5, 4, _],
    arp:  [7, 11, 14, 18, 14, 11, 7, 11, 12, 16, 19, 16, 11, 14, 18, 21],
    lead: [14, _, _, 16, _, 18, _, _, 19, _, 18, _, 16, _, 14, _],
    drums: { kick: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] },
  },
  // Far future: dark phrygian, half-time menace, detuned saw lead.
  '2088': {
    bpm: 140, root: 41, scale: [0, 1, 3, 5, 7, 8, 10], wave: 'sawtooth',
    bass: [0, 0, _, 0, 1, _, 0, _, 0, 0, _, 0, 5, _, 4, _],
    arp:  [7, 8, 10, 8, 7, 8, 12, 8, 7, 8, 10, 8, 14, 12, 10, 8],
    lead: [14, _, _, _, 15, _, _, _, 14, _, 12, _, 11, _, _, _],
    drums: { kick: [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0], snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], hat: [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1] },
  },
  // 1955 Atomic Diner: a jukebox I–vi–IV–V in a sunny major key, dotted hats, walking bass.
  '1955': {
    bpm: 100, root: 46, scale: [0, 2, 4, 5, 7, 9, 11], wave: 'triangle',
    bass: [0, _, 2, 4, 5, _, 4, 2, 3, _, 5, 7, 4, _, 6, 4],
    arp:  [7, 9, 11, 9, 12, 14, 16, 14, 10, 12, 14, 12, 11, 13, 15, 13],
    lead: [14, _, 16, _, 18, _, _, 16, 17, _, 16, _, 15, _, _, _],
    drums: { kick: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1] },
  },
  // 2061 Low Orbit: floating lydian, wide sine-ish triangle arps over a slow pulse (ticket 0150).
  '2061': {
    bpm: 104, root: 44, scale: [0, 2, 4, 6, 7, 9, 11], wave: 'triangle',
    bass: [0, _, _, _, 0, _, 4, _, 3, _, _, _, 5, _, 4, _],
    arp:  [7, 11, 14, 18, 21, 18, 14, 11, 9, 13, 16, 20, 23, 20, 16, 13],
    lead: [21, _, _, _, 20, _, 18, _, 16, _, _, _, 18, _, _, _],
    drums: { kick: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], hat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1] },
  },
};

export const DEFAULT_SCORE = ERA_SCORES['2026'];

export function scoreFor(eraId) {
  return ERA_SCORES[eraId] || DEFAULT_SCORE;
}

/** Which layers play at a given speed (mph). Drums always; a warp opens everything up. */
export function layersFor(speed, warpActive) {
  if (warpActive) return { drums: true, bass: true, arp: true, lead: true, pad: true };
  return { drums: true, bass: speed >= 30, arp: speed >= 60, lead: speed >= 86, pad: speed >= 86 };
}

export function stepDuration(bpm) {
  return 60 / bpm / 4;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Scale degree (any integer; 7 = an octave up for 7-note scales) → Hz. */
export function noteFreq(score, degree, octave) {
  const n = score.scale.length;
  const oct = Math.floor(degree / n) + octave;
  const idx = ((degree % n) + n) % n;
  return midiToFreq(score.root + score.scale[idx] + 12 * oct);
}

/**
 * Lookahead scheduler. Call tick() every ~25 ms; it queues every step whose start time falls
 * inside [now, now + lookahead]. getState() → { playing, speed, eraId, warp }.
 */
export function createScheduler(ctx, out, getState) {
  const lookahead = 0.12;
  let nextTime = 0;
  let step = 0;
  let noise = null;

  function noiseBuffer() {
    if (!noise) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x3fffffff) - 1;
      }
    }
    return noise;
  }

  function env(gainNode, when, peak, decay) {
    gainNode.gain.setValueAtTime(0.0001, when);
    gainNode.gain.exponentialRampToValueAtTime(peak, when + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  }

  function tone(freq, when, dur, type, peak, cutoff) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    env(g, when, peak, dur);
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, when);
      o.connect(f); f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(out);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function kick(when) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    env(g, when, 0.42, 0.22);
    o.connect(g); g.connect(out);
    o.start(when); o.stop(when + 0.25);
  }

  function hiss(when, dur, peak, hp) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(hp, when);
    const g = ctx.createGain();
    env(g, when, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(when); s.stop(when + dur + 0.02);
  }

  function playStep(i, when, st) {
    const sc = scoreFor(st.eraId);
    const L = layersFor(st.speed, st.warp);
    const sd = stepDuration(sc.bpm);
    const brightness = 700 + Math.min(1, st.speed / 100) * 2600 + (st.warp ? 1800 : 0);
    if (L.drums) {
      if (sc.drums.kick[i]) kick(when);
      if (sc.drums.snare[i] && (st.speed >= 15 || st.warp)) hiss(when, 0.16, 0.22, 1400);
      if (sc.drums.hat[i] && (st.speed >= 45 || st.warp)) hiss(when, 0.04, 0.08, 7000);
    }
    if (L.bass && sc.bass[i] !== null) tone(noteFreq(sc, sc.bass[i], -1), when, sd * 1.6, 'sawtooth', 0.13, 420 + brightness * 0.2);
    if (L.arp && sc.arp[i] !== null) tone(noteFreq(sc, sc.arp[i], 0), when, sd * 0.9, 'square', 0.05, brightness);
    if (L.lead && sc.lead[i] !== null) {
      tone(noteFreq(sc, sc.lead[i], 0), when, sd * 3, sc.wave, 0.07, brightness + 800);
      tone(noteFreq(sc, sc.lead[i], 0) * 1.006, when, sd * 3, sc.wave, 0.05, brightness + 800);
    }
    if (L.pad && i % 8 === 0) {
      const root = sc.bass[i] !== null ? sc.bass[i] : 0;
      for (const d of [root + 7, root + 9, root + 11]) tone(noteFreq(sc, d, -1), when, sd * 8, 'triangle', 0.035, 1800);
    }
  }

  return {
    lookahead,
    tick() {
      const now = ctx.currentTime;
      const st = getState();
      // Fell behind (first call, tab backgrounded, long GC)? Resync to now — never schedule
      // into the past and never emit a catch-up burst.
      if (nextTime < now) nextTime = now;
      if (!st.playing) { nextTime = now; return; }
      const sd = stepDuration(scoreFor(st.eraId).bpm);
      while (nextTime <= now + lookahead) {
        playStep(step % 16, nextTime, st);
        nextTime += sd;
        step++;
      }
    },
    reset() { step = 0; nextTime = 0; },
  };
}
