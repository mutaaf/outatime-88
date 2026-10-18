// Recorded sound effects (ticket 0132). A lazy chunk: src/audio.js imports it after the first
// tap/key (when the AudioContext exists), then this module fetches and decodes the samples in
// the background. Until a sample is decoded, or if its fetch fails, SoundEngine keeps using
// its synth voice for that sound, so audio never blocks or breaks the game.
//
// Every file is CC0 (Kenney.nl packs and OpenGameArt CC0 uploads); sources, licenses and the
// processing applied are listed in docs/AUDIO_CREDITS.md. Files are served from the game's own
// /outatime/assets/ (content-hashed; the service worker caches them the first time).
//
// Also here, because they need no files: the tyre squeal and wall scrub voices (procedural,
// driven by src/smoke.js screechLevel), and the sampled engine (two recorded loops, pitched by
// the drivetrain's rpm/gear and crossfaded low → high).
import { createScreechGate, screechLevel } from '../smoke.js';

export const SAMPLE_URLS = {
  engineLo: new URL('./audio/engine-lo.wav', import.meta.url).href,
  engineHi: new URL('./audio/engine-hi.wav', import.meta.url).href,
  start: new URL('./audio/start.mp3', import.meta.url).href,
  horn: new URL('./audio/horn.mp3', import.meta.url).href,
  crash: new URL('./audio/crash.mp3', import.meta.url).href,
  crash2: new URL('./audio/crash2.mp3', import.meta.url).href,
  bump: new URL('./audio/bump.mp3', import.meta.url).href,
  cone: new URL('./audio/cone.mp3', import.meta.url).href,
  debris: new URL('./audio/debris.mp3', import.meta.url).href,
  land: new URL('./audio/land.mp3', import.meta.url).href,
  takedown: new URL('./audio/takedown.mp3', import.meta.url).href,
  roar: new URL('./audio/roar.mp3', import.meta.url).href,
  coin: new URL('./audio/coin.mp3', import.meta.url).href,
  booster: new URL('./audio/booster.mp3', import.meta.url).href,
  nos: new URL('./audio/nos.mp3', import.meta.url).href,
  warp: new URL('./audio/warp.mp3', import.meta.url).href,
  zone: new URL('./audio/zone.mp3', import.meta.url).href,
  stunt: new URL('./audio/stunt.mp3', import.meta.url).href,
  checkpoint: new URL('./audio/checkpoint.mp3', import.meta.url).href,
  beep: new URL('./audio/beep.mp3', import.meta.url).href,
  click: new URL('./audio/click.mp3', import.meta.url).href,
  whoosh: new URL('./audio/whoosh.mp3', import.meta.url).href,
};

// Mix level per sample (the files are peak-normalised to -1 dBFS).
const LEVEL = {
  start: 0.5, horn: 0.55, crash: 0.8, crash2: 0.8, bump: 0.6, cone: 0.55, debris: 0.45, land: 0.85,
  takedown: 0.7, roar: 0.75, coin: 0.4, booster: 0.5, warp: 0.5, zone: 0.5, stunt: 0.45,
  checkpoint: 0.45, beep: 0.45, click: 0.25, whoosh: 0.6,
};

export const MAX_VOICES = 12;

/** decodeAudioData with the old callback form as a fallback (older Safari). */
function decode(ctx, ab) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(ab, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

/** Engine layer mix for a rev position (0..1): low loop fades out as the high loop comes in. */
export function engineMix(rev01) {
  const t = Math.max(0, Math.min(1, (rev01 - 0.25) / 0.6));
  return { lo: Math.cos(t * Math.PI / 2), hi: Math.sin(t * Math.PI / 2) };
}

/** Playback rates for the two engine loops at a speed/rpm, per car voice pitch. */
export function engineRates(rpm, gear, pitch = 1) {
  const r = Math.max(0, Math.min(1, ((rpm || 18) - 18) / 82));
  const g = Math.max(1, Math.min(6, gear || 1));
  return { lo: (0.7 + r * 0.75 + g * 0.03) * pitch, hi: (0.72 + r * 0.7 + g * 0.06) * pitch, rev: r * 0.65 + (g - 1) / 5 * 0.35 };
}

/** The squeal's target gain and pitch for a squeal level (after the hysteresis gate). */
export function screechVoice(level) {
  if (level <= 0) return { gain: 0, pitch: 1 };
  const l = Math.min(1, level);
  return { gain: 0.05 + l * 0.2, pitch: 0.88 + l * 0.28 };
}

/**
 * @param {AudioContext} ctx
 * @param {{sfx: AudioNode, engine: AudioNode, fetch?: Function}} o
 */
export function createBank(ctx, o) {
  const buffers = {};
  const fetchFn = o.fetch || ((u) => fetch(u));
  // Voice pool: fixed gain nodes; a new sound takes a free one or steals the oldest.
  const voices = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const g = ctx.createGain();
    g.connect(o.sfx);
    voices.push({ g, src: null, at: 0 });
  }
  let engine = null, tyres = null, nos = null;
  const gate = createScreechGate();

  const bank = {
    ready: false,
    loaded: 0,
    failed: 0,
    buffers,
    voices,
    has: (name) => Boolean(buffers[name]),
    /** Fetch + decode every sample; resolves when all have settled (never rejects). */
    load() {
      const names = Object.keys(SAMPLE_URLS);
      return Promise.all(names.map((name) => Promise.resolve()
        .then(() => fetchFn(SAMPLE_URLS[name]))
        .then((r) => (r && r.ok ? r.arrayBuffer() : Promise.reject(new Error('fetch'))))
        .then((ab) => decode(ctx, ab))
        .then((buf) => { buffers[name] = buf; bank.loaded++; })
        .catch(() => { bank.failed++; })))
        .then(() => { bank.ready = bank.loaded > 0; return bank; });
    },
    /** Play a one-shot. Returns false if the sample isn't available (caller falls back). */
    play(name, rate = 1, gain = 1) {
      const buf = buffers[name];
      if (!buf) return false;
      try {
        let v = null;
        for (const c of voices) if (!c.src) { v = c; break; }
        if (!v) {
          v = voices[0];
          for (const c of voices) if (c.at < v.at) v = c;
          try { v.src.stop(); } catch (e) { /* already ended */ }
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        v.g.gain.setValueAtTime((LEVEL[name] == null ? 0.5 : LEVEL[name]) * gain, ctx.currentTime);
        src.connect(v.g);
        v.src = src;
        v.at = ctx.currentTime;
        src.onended = () => { if (v.src === src) v.src = null; try { src.disconnect(); } catch (e) { /* gone */ } };
        src.start();
        return true;
      } catch (e) {
        return false;
      }
    },
    /** True once both engine loops are decoded (SoundEngine then mutes its synth engine). */
    engineReady: () => Boolean(buffers.engineLo && buffers.engineHi),
    /**
     * Drive the sampled engine. Call every frame; cheap (param targets only).
     * @param {{rpm:number, gear:number, throttle:boolean, playing:boolean, pitch:number, growl:number}} e
     */
    engine(e) {
      if (!bank.engineReady()) return false;
      if (!engine) engine = buildEngine();
      const t = ctx.currentTime;
      const r = engineRates(e.rpm, e.gear, e.pitch || 1);
      const mix = engineMix(r.rev);
      const load = e.throttle ? 1 : 0.7;
      engine.lo.playbackRate.setTargetAtTime(r.lo, t, 0.06);
      engine.hi.playbackRate.setTargetAtTime(r.hi, t, 0.06);
      engine.loG.gain.setTargetAtTime(e.playing ? mix.lo * 0.9 * load : 0, t, 0.08);
      engine.hiG.gain.setTargetAtTime(e.playing ? mix.hi * 0.7 * load : 0, t, 0.08);
      const growl = e.growl || 1;
      engine.tone.frequency.setTargetAtTime((900 + r.rev * 4200) * (growl > 1 ? 0.7 : growl < 1 ? 1.35 : 1), t, 0.08);
      return true;
    },
    /** NOS burn: a looping thruster roar while the tank is open. */
    nos(on) {
      if (!buffers.nos) return;
      if (!nos) {
        const src = ctx.createBufferSource();
        src.buffer = buffers.nos;
        src.loop = true;
        src.loopStart = 0.4; // inside the file, clear of the mp3 encoder padding
        src.loopEnd = Math.max(0.8, buffers.nos.duration - 0.4);
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g); g.connect(o.sfx);
        src.start(0, 0.4);
        nos = { src, g, on: false };
      }
      if (nos.on !== on) {
        nos.on = on;
        nos.g.gain.setTargetAtTime(on ? 0.42 : 0, ctx.currentTime, on ? 0.04 : 0.18);
      }
    },
    /**
     * Tyre squeal and wall scrub. `state` is GameState-shaped (src/smoke.js screechLevel) or a
     * level 0..1, null when not racing; `scrub` 0..1. Built on first use; needs no sample files.
     */
    tyres(state, scrub) {
      const level = typeof state === 'number' ? state : state ? screechLevel(state) : 0;
      const sq = screechVoice(gate.step(level));
      if (!tyres) {
        if (sq.gain <= 0 && scrub <= 0) return 0;
        tyres = buildTyres();
      }
      const t = ctx.currentTime;
      tyres.sqG.gain.setTargetAtTime(sq.gain, t, sq.gain > 0 ? 0.04 : 0.12);
      tyres.a.frequency.setTargetAtTime(1180 * sq.pitch, t, 0.05);
      tyres.b.frequency.setTargetAtTime(1790 * sq.pitch, t, 0.05);
      tyres.band.frequency.setTargetAtTime(2100 * sq.pitch, t, 0.05);
      tyres.scG.gain.setTargetAtTime(scrub > 0 ? 0.16 + scrub * 0.2 : 0, t, scrub > 0 ? 0.03 : 0.1);
      return sq.gain;
    },
  };

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
    return b;
  }

  function buildEngine() {
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.connect(o.engine);
    const layer = (buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g); g.connect(tone);
      src.start();
      return [src, g];
    };
    const [lo, loG] = layer(buffers.engineLo);
    const [hi, hiG] = layer(buffers.engineHi);
    return { lo, loG, hi, hiG, tone };
  }

  // Squeal: two detuned tones wobbling (the tread stick-slipping) over band-passed hiss.
  // Scrub: low rumble of noise for grinding along a wall.
  function buildTyres() {
    const noise = noiseBuffer(1.5);
    const sqG = ctx.createGain(); sqG.gain.value = 0; sqG.connect(o.sfx);
    const scG = ctx.createGain(); scG.gain.value = 0; scG.connect(o.sfx);
    const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2100; band.Q.value = 5;
    const hissG = ctx.createGain(); hissG.gain.value = 0.55;
    hiss.connect(band); band.connect(hissG); hissG.connect(sqG);
    const a = ctx.createOscillator(); a.type = 'triangle'; a.frequency.value = 1180;
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 1790;
    const toneG = ctx.createGain(); toneG.gain.value = 0.35;
    const bG = ctx.createGain(); bG.gain.value = 0.18;
    a.connect(toneG); b.connect(bG); bG.connect(toneG); toneG.connect(sqG);
    // Stick-slip wobble: a fast LFO on pitch and a faster flutter on level.
    const wob = ctx.createOscillator(); wob.frequency.value = 11;
    const wobAmt = ctx.createGain(); wobAmt.gain.value = 45;
    wob.connect(wobAmt); wobAmt.connect(a.frequency); wobAmt.connect(b.frequency);
    const flut = ctx.createOscillator(); flut.frequency.value = 23;
    const flutAmt = ctx.createGain(); flutAmt.gain.value = 0.12;
    flut.connect(flutAmt); flutAmt.connect(toneG.gain);
    const scrub = ctx.createBufferSource(); scrub.buffer = noise; scrub.loop = true; scrub.playbackRate.value = 0.6;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 650;
    scrub.connect(low); low.connect(scG);
    for (const n of [hiss, a, b, wob, flut, scrub]) n.start();
    return { sqG, scG, a, b, band };
  }

  return bank;
}

/** UI clicks: one delegated listener for menu buttons (none during a race's canvas taps). */
export function bindUiClicks(doc, play) {
  const onDown = (e) => {
    const el = e.target && e.target.closest && e.target.closest('button, [role="button"], .btn');
    if (el && !el.disabled) play();
  };
  doc.addEventListener('pointerdown', onDown, { passive: true });
  return () => doc.removeEventListener('pointerdown', onDown);
}
