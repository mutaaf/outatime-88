// Street-tuner sound layer (ticket 0193). A lazy chunk: src/audio.js imports it once there's an
// AudioContext and calls frame() once per frame from updateEngine(). Everything here is
// synthesized on the device (no files), and the rules live in ./street-params.js.
//
// What it adds on top of the engine, the recorded samples and the tyre screech:
//   turbo spool whistle · blow-off valve · upshift chirp · rev-limiter bounce · overrun crackle
//   and backfire pops · launch burble on the grid · NOS valve click → hiss → whoosh, a tunnel
//   low-pass on the music while it burns and a purge puff when it ends · a tuner squeal over
//   the screech · a drift-hold tone · Doppler pass-bys · wind rush · tunnel reverb · metal
//   crunch by impact · slow-mo bass drops · countdown heartbeat, GO hit, level-up and run-over
//   stingers · music ducking under the big moments · the slipstream charge tone (0197): it
//   rises with draftCharge while you sit in a wake and ticks from READY until the slingshot.
//
// The per-frame work is param targets on a fixed set of nodes (no allocation). One-shots build
// a handful of short-lived nodes, like SoundEngine.playTone, and are capped by `live`.
import {
  CHARACTERS, characterFor, boostTarget, stepBoost, spoolVoice, blowOff, shiftChirp, onLimiter,
  crackleRate, squealLayer, driftTone, windFor, dopplerRatio, passedBy, passByGain, crunchFor,
  reverbFor, musicCutoff, BIG_AIR_S,
} from './street-params.js';
import { draftCue, inWake } from '../slipstream.js';

const MAX_LIVE = 14; // one-shots alive at once; past this, new ones are dropped

/**
 * @param {AudioContext} ctx
 * @param {object} se the SoundEngine (buses, mix, mute, music chain)
 */
export function createTuner(ctx, se) {
  let live = 0;
  let seed = 0x1f2e3d4c;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

  const noise = (() => {
    const n = Math.floor(ctx.sampleRate * 1.5);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  })();

  // --- one-shot helpers ---------------------------------------------------------------------
  const quiet = () => se.muted || se.volume <= 0 || !se.sfxBus;
  function envGain(when, peak, attack, dur, out) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(out || se.sfxBus);
    return g;
  }
  function done(src, dur) {
    live++;
    let ended = false;
    const end = () => { if (!ended) { ended = true; live = Math.max(0, live - 1); } };
    src.onended = end;
    // Belt and braces: a context that never fires onended (tests, a suspended tab) still frees it.
    if (typeof setTimeout === 'function') setTimeout(end, (dur + 0.25) * 1000);
  }
  /** Filtered noise burst. type/hz/q shape it; hz2 sweeps it. */
  function burst(when, dur, peak, type, hz, hz2, q = 1, out, attack = 0.004, rate = 1) {
    if (live >= MAX_LIVE) return;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(hz, when);
    if (hz2) f.frequency.exponentialRampToValueAtTime(hz2, when + dur);
    f.Q.value = q;
    const g = envGain(when, peak, attack, dur, out);
    s.connect(f); f.connect(g);
    s.start(when, rnd() * 0.8);
    s.stop(when + dur + 0.02);
    done(s, dur);
  }
  /** A pitched blip. */
  function tone(when, dur, peak, type, hz, hz2, out, attack = 0.004) {
    if (live >= MAX_LIVE) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, hz), when);
    if (hz2) o.frequency.exponentialRampToValueAtTime(Math.max(20, hz2), when + dur);
    const g = envGain(when, peak, attack, dur, out);
    o.connect(g);
    o.start(when);
    o.stop(when + dur + 0.02);
    done(o, dur);
  }

  // --- continuous voices (built on the first racing frame) ------------------------------------
  let v = null;
  function build() {
    const t = ctx.currentTime;
    const mk = (out) => { const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.connect(out); return g; };
    // Turbo spool: a sine whistle with a breathy band of noise, on the engine bus.
    const spoolG = mk(se.engineBus);
    const spool = ctx.createOscillator(); spool.type = 'sine'; spool.frequency.value = 1200;
    const spool2 = ctx.createOscillator(); spool2.type = 'triangle'; spool2.frequency.value = 2400;
    const sp2G = ctx.createGain(); sp2G.gain.value = 0.25;
    spool.connect(spoolG); spool2.connect(sp2G); sp2G.connect(spoolG);
    // Wind: low-passed, band-passed hiss that opens with speed.
    const windG = mk(se.sfxBus);
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true; wind.playbackRate.value = 0.5;
    const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.6;
    wind.connect(windF); windF.connect(windG);
    // Tuner squeal over the screech: a thin, wavering saw.
    const sqG = mk(se.sfxBus);
    const sq = ctx.createOscillator(); sq.type = 'sawtooth'; sq.frequency.value = 1800;
    const sqF = ctx.createBiquadFilter(); sqF.type = 'bandpass'; sqF.frequency.value = 2200; sqF.Q.value = 3;
    const wob = ctx.createOscillator(); wob.frequency.value = 7;
    const wobAmt = ctx.createGain(); wobAmt.gain.value = 60;
    wob.connect(wobAmt); wobAmt.connect(sq.frequency);
    sq.connect(sqF); sqF.connect(sqG);
    // Drift hold: a held, slowly breathing note.
    const driftG = mk(se.sfxBus);
    const drift = ctx.createOscillator(); drift.type = 'triangle'; drift.frequency.value = 330;
    const drift5 = ctx.createOscillator(); drift5.type = 'sine'; drift5.frequency.value = 495;
    const d5G = ctx.createGain(); d5G.gain.value = 0.5;
    drift.connect(driftG); drift5.connect(d5G); d5G.connect(driftG);
    // Tunnel reverb: a send from the effects and engine buses into a generated room.
    const revSend = ctx.createGain(); revSend.gain.setValueAtTime(0, t);
    let conv = null;
    if (typeof ctx.createConvolver === 'function') {
      conv = ctx.createConvolver();
      conv.buffer = impulse(1.6, 2.6);
      revSend.connect(conv);
      conv.connect(se.compressor);
      se.sfxBus.connect(revSend);
      se.engineBus.connect(revSend);
    }
    for (const n of [spool, spool2, wind, sq, wob, drift, drift5]) n.start(t);
    return { spoolG, spool, spool2, windG, windF, sqG, sq, sqF, driftG, drift, drift5, revSend, conv };
  }
  /** A mono room: decaying noise (mono-safe on a phone speaker). */
  function impulse(seconds, decay) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / n, decay);
    return b;
  }

  // --- music ducking (sidechain-style) and the mood filter ------------------------------------
  function duck(depth, hold = 0.25) {
    if (!se.musicDuck || depth <= 0) return;
    const g = se.musicDuck.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.15, 1 - depth), t, 0.02);
    g.setTargetAtTime(1, t + hold, 0.35);
  }

  // --- state ------------------------------------------------------------------------------------
  const st = {
    ch: 'i6', boost: 0, lastT: 0, prevThrottle: false, prevGear: 1, prevNos: false, sinceLift: 9,
    crackAcc: 0, limAcc: 0, burbleAcc: 0, air: 0, bigAir: false, prevSlowmo: false, prevStreak: 0,
    prevStatus: '', passCool: 0, active: false,
    // This frame's voice levels (read by tests and ?debug): spool, squeal, drift, wind, reverb.
    spool: 0, squeal: 0, drift: 0, wind: 0, wet: 0, passes: 0, nosOpens: 0,
    // Slipstream tone (0197): on, its gain and pitch this frame, READY ticks played, tones started.
    draftOn: false, draft: 0, draftHz: 0, draftTicks: 0, draftStarts: 0, tickAcc: 0,
  };
  const cue = {};
  // The slipstream tone exists only while you are in a wake: built on entry, stopped on exit.
  let dv = null;
  function draftVoice(t) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.connect(se.sfxBus);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(cue.hz, t);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(cue.hz * 2, t);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2); g2.connect(g);
    o.start(t); o2.start(t);
    st.draftStarts++;
    return { g, o, o2 };
  }
  function draftOff(t) {
    if (dv) {
      dv.g.gain.cancelScheduledValues(t);
      dv.g.gain.setTargetAtTime(0, t, 0.03); // ~1% by 150 ms
      dv.o.stop(t + 0.18); dv.o2.stop(t + 0.18);
      dv = null;
    }
    st.draftOn = false; st.draft = 0; st.draftHz = 0; st.tickAcc = 0;
  }
  /** Slipstream: tone pitch and level follow the charge; from READY a tick every 0.2 s. */
  function slipstream(G, t, dt) {
    draftCue(inWake(G), G.draftCharge, G.reducedMotion, t, cue);
    if (!cue.on || quiet()) { draftOff(t); return; }
    if (!dv) dv = draftVoice(t);
    dv.o.frequency.setTargetAtTime(cue.hz, t, 0.05);
    dv.o2.frequency.setTargetAtTime(cue.hz * 2, t, 0.05);
    dv.g.gain.setTargetAtTime(cue.gain * se.sfxMix, t, 0.06);
    st.draftOn = true; st.draft = cue.gain; st.draftHz = cue.hz;
    if (cue.ready) {
      if (st.tickAcc <= 0) { tone(t, 0.06, 0.07, 'square', cue.hz * 3, cue.hz * 4); st.draftTicks++; st.tickAcc = 0.2; }
      st.tickAcc -= dt;
    } else st.tickAcc = 0;
  }

  const tuner = {
    get live() { return live; },
    st,
    duck,
    setCharacter(shape, carName) { st.ch = characterFor(shape, carName); },

    // ---- one-shots -----------------------------------------------------------------------------
    blowOff(gain = 1) {
      if (quiet()) return;
      const t = ctx.currentTime;
      burst(t, 0.32, 0.2 * gain, 'bandpass', 3800, 1100, 1.6, null, 0.006, 1.4);
      burst(t + 0.01, 0.12, 0.08 * gain, 'highpass', 6000, 0, 0.7);
    },
    chirp() {
      if (quiet()) return;
      const t = ctx.currentTime;
      tone(t, 0.05, 0.05, 'square', 2300, 1700);
      burst(t, 0.035, 0.06, 'highpass', 4500, 0, 0.7);
    },
    pop(when, depthHz, gain = 1) {
      if (quiet()) return;
      const hz = depthHz * (0.8 + rnd() * 0.5);
      burst(when, 0.07 + rnd() * 0.05, (0.12 + rnd() * 0.12) * gain, 'lowpass', hz * 9, hz * 3, 2);
      tone(when, 0.05, 0.09 * gain, 'square', hz, hz * 0.6);
    },
    limiterTick(when, hz) {
      if (quiet()) return;
      tone(when, 0.03, 0.05, 'sawtooth', hz * 6, hz * 5);
    },
    nosOpen() {
      if (quiet()) return;
      const t = ctx.currentTime;
      tone(t, 0.025, 0.08, 'square', 3200, 2400);              // valve click
      burst(t + 0.02, 0.5, 0.16, 'highpass', 5200, 2600, 0.7, null, 0.05); // pressurised hiss
      burst(t + 0.12, 0.9, 0.28, 'bandpass', 260, 2600, 0.9, null, 0.18);  // the roar opening up
      duck(0.45, 0.6);
    },
    nosPurge() {
      if (quiet()) return;
      const t = ctx.currentTime;
      burst(t, 0.38, 0.14, 'highpass', 1600, 4200, 0.6, null, 0.01, 1.3);
    },
    passBy(dir, gain, closingMph, lat) {
      if (quiet() || gain <= 0.02) return;
      const t = ctx.currentTime;
      const r = dopplerRatio(Math.abs(closingMph));
      let out = se.sfxBus;
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-0.5, Math.min(0.5, lat * 0.6)); // gentle: still reads in mono
        p.connect(se.sfxBus);
        out = p;
      }
      burst(t, 0.42, gain * 0.5, 'bandpass', 1300 * r, 1300 / r, 1.2, out, 0.08);
      tone(t, 0.42, gain * 0.16, 'sawtooth', 160 * r, 160 / r, out, 0.06);
    },
    crunch(dv) {
      const c = crunchFor(dv);
      if (!c || quiet()) return;
      const t = ctx.currentTime;
      burst(t, c.dur, c.gain * 0.6, 'lowpass', 2400 * c.rate, 300, 0.8, null, 0.003, c.rate);
      tone(t, c.dur * 0.8, c.gain * 0.14, 'square', 187 * c.rate, 120);
      tone(t, c.dur * 0.6, c.gain * 0.1, 'square', 271 * c.rate, 160);
      if (c.glass) for (let i = 0; i < 4; i++) burst(t + 0.03 + i * 0.045, 0.05, 0.05, 'highpass', 7000 + rnd() * 3000, 0, 4);
      if (c.duck) duck(c.duck, 0.3);
    },
    bassDrop(depth = 1) {
      if (quiet()) return;
      const t = ctx.currentTime;
      tone(t, 1.1, 0.32 * depth, 'sine', 120, 30, null, 0.01);
      tone(t, 0.6, 0.12 * depth, 'triangle', 60, 28, null, 0.01);
      burst(t, 0.9, 0.06 * depth, 'lowpass', 400, 80, 0.7, null, 0.2);
      duck(0.35 * depth, 0.5);
    },
    /** Countdown light: a heartbeat lub-dub under the beep; the green light is a hit. */
    beep(go) {
      if (quiet()) return;
      const t = ctx.currentTime;
      if (go) {
        tone(t, 0.7, 0.36, 'sine', 95, 32, null, 0.004);
        burst(t, 0.5, 0.2, 'lowpass', 5000, 600, 0.7);
        burst(t, 0.9, 0.06, 'highpass', 6000, 9000, 0.6, null, 0.01);
        duck(0.3, 0.3);
        return;
      }
      tone(t, 0.16, 0.26, 'sine', 62, 42, null, 0.004);
      tone(t + 0.17, 0.14, 0.18, 'sine', 58, 40, null, 0.004);
    },
    levelUp() {
      if (quiet()) return;
      const t = ctx.currentTime;
      for (const [i, hz] of [[0, 220], [1, 277.18], [2, 329.63]]) tone(t + i * 0.01, 0.9, 0.05, 'sawtooth', hz, hz * 2, null, 0.3);
      burst(t, 0.8, 0.08, 'highpass', 1200, 9000, 0.7, null, 0.6);
      tone(t + 0.62, 0.5, 0.24, 'sine', 110, 40);
    },
    runOver() {
      if (quiet()) return;
      const t = ctx.currentTime;
      tone(t, 0.9, 0.16, 'sawtooth', 260, 38, null, 0.01); // tape stop
      tone(t + 0.05, 0.9, 0.1, 'square', 130, 30, null, 0.01);
      tone(t + 0.7, 0.6, 0.3, 'sine', 70, 30);
    },

    /**
     * Once per frame from SoundEngine.updateEngine. `G` is GameState; `world` the hooks main
     * registered ({ bodies(), playerZ(), seg(z) }), or null.
     */
    frame(G, playing, world) {
      const t = ctx.currentTime;
      const dt = Math.max(0, Math.min(0.1, t - (st.lastT || t)));
      st.lastT = t;
      // Stingers that fire on the way out of a run.
      if (st.prevStatus === 'PLAYING' && G.status === 'GAMEOVER') tuner.runOver();
      st.prevStatus = G.status;

      if (!playing) {
        if (dv || st.draftOn) draftOff(t);
        if (st.active) {
          st.active = false;
          if (v) for (const g of [v.spoolG, v.windG, v.sqG, v.driftG]) g.gain.setTargetAtTime(0, t, 0.08);
          if (v) v.revSend.gain.setTargetAtTime(0, t, 0.1);
          if (se.musicLP) se.musicLP.frequency.setTargetAtTime(20000, t, 0.2);
          st.boost = 0; st.prevNos = false; st.air = 0; st.bigAir = false;
        }
        return;
      }
      if (!v) v = build();
      st.active = true;
      const fx = se.sfxMix;
      const c = CHARACTERS[st.ch];
      const mph = G.speed || 0;
      const throttle = Boolean(G.throttle);
      const rpm = G.rpm || 18;

      // Turbo.
      st.boost = stepBoost(st.boost, boostTarget(rpm, throttle), dt);
      const sp = spoolVoice(st.boost, st.ch);
      v.spool.frequency.setTargetAtTime(sp.hz || 800, t, 0.05);
      v.spool2.frequency.setTargetAtTime((sp.hz || 800) * 2.01, t, 0.05);
      v.spoolG.gain.setTargetAtTime(sp.gain * fx, t, 0.06);
      st.spool = sp.gain;

      // Shifts, lifts and the blow-off valve.
      const shifted = shiftChirp(st.prevGear, G.gear || 1, throttle, mph);
      if (shifted && c.crackle) tuner.chirp();
      if (c.turbo && blowOff(st.prevThrottle, throttle, st.boost, shifted)) { tuner.blowOff(0.6 + st.boost * 0.4); if (!shifted) st.boost *= 0.3; }
      if (st.prevThrottle && !throttle) st.sinceLift = 0; else st.sinceLift += dt;
      st.prevThrottle = throttle;
      st.prevGear = G.gear || 1;

      // Overrun crackle and backfire pops (scheduled a few ms ahead so they sit inside the frame).
      st.crackAcc += crackleRate(throttle, rpm, mph, st.ch, st.sinceLift) * dt;
      while (st.crackAcc >= 1) { st.crackAcc -= 1; tuner.pop(t + rnd() * dt, c.pop, 1); }
      // Rev limiter bounce.
      if (c.limiter && onLimiter(rpm, throttle)) {
        st.limAcc += c.limiter * dt;
        while (st.limAcc >= 1) { st.limAcc -= 1; tuner.limiterTick(t + rnd() * 0.01, c.pop); }
      } else st.limAcc = 0;
      // Launch control on the grid: a lumpy burble with the odd pop.
      if (G.racePhase === 'START' && c.burble) {
        st.burbleAcc += c.burble * dt;
        while (st.burbleAcc >= 1) { st.burbleAcc -= 1; tuner.pop(t + rnd() * dt, c.pop * 0.8, 0.45); }
      } else st.burbleAcc = 0;

      // NOS.
      const nos = Boolean(G.nosBurning);
      if (nos && !st.prevNos) { tuner.nosOpen(); st.nosOpens++; }
      if (!nos && st.prevNos) tuner.nosPurge();
      st.prevNos = nos;

      // Tyres.
      const sql = squealLayer(G.tyreSlip);
      if (sql.hz) { v.sq.frequency.setTargetAtTime(sql.hz, t, 0.05); v.sqF.frequency.setTargetAtTime(sql.hz * 1.2, t, 0.05); }
      v.sqG.gain.setTargetAtTime(sql.gain * fx, t, sql.gain ? 0.04 : 0.12);
      st.squeal = sql.gain;
      const dtn = driftTone(G.isDrifting, G.driftTier);
      if (dtn.hz) { v.drift.frequency.setTargetAtTime(dtn.hz, t, 0.2); v.drift5.frequency.setTargetAtTime(dtn.hz * 1.5, t, 0.2); }
      v.driftG.gain.setTargetAtTime(dtn.gain * fx, t, dtn.gain ? 0.15 : 0.2);
      st.drift = dtn.gain;

      slipstream(G, t, dt);

      // Wind.
      const w = windFor(mph);
      v.windF.frequency.setTargetAtTime(w.hz, t, 0.1);
      v.windG.gain.setTargetAtTime(w.gain * fx, t, 0.15);
      st.wind = w.gain;

      // The road around you: tunnels ring, and cars rush past.
      if (world) {
        const pz = world.playerZ();
        const seg = world.seg ? world.seg(pz) : null;
        const wet = reverbFor(seg && seg.trackType, Boolean(seg && seg.overhead));
        v.revSend.gain.setTargetAtTime(wet * 0.5, t, wet ? 0.08 : 0.25);
        st.wet = wet;
        st.passCool = Math.max(0, st.passCool - dt);
        const bodies = world.bodies();
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.kind !== 'TRAFFIC' && b.kind !== 'RIVAL') continue;
          const dz = b.worldZ - pz;
          const lat = (b.offset || 0) - (G.playerX || 0);
          const prev = b._sndDz;
          b._sndDz = dz;
          const pass = passedBy(prev, dz, lat);
          if (!pass || st.passCool > 0) continue;
          const closing = mph - (b.mph || 0);
          const gain = passByGain(closing, lat);
          if (gain > 0.02) { tuner.passBy(pass, gain, closing, lat); st.passCool = 0.09; st.passes++; }
        }
      }

      // Big moments: big air, slow-mo takedowns, near-miss chains.
      if ((G.playerY || 0) > 10) st.air += dt; else { st.air = 0; st.bigAir = false; }
      if (st.air > BIG_AIR_S && !st.bigAir) { st.bigAir = true; tuner.bassDrop(G.reducedMotion ? 0.4 : 0.7); }
      const slowmo = (G.takedownSlowMoTimer || 0) > 0;
      if (slowmo && !st.prevSlowmo) tuner.bassDrop(G.reducedMotion ? 0.5 : 1);
      st.prevSlowmo = slowmo;
      const streak = G.dodgeStreak || 0;
      if (streak > st.prevStreak && streak >= 5 && streak % 5 === 0 && mph > 60) tuner.bassDrop(0.45);
      st.prevStreak = streak;

      // Mood filter on the music: NOS tunnel, slow-mo and big air go under water.
      if (se.musicLP) {
        const hz = musicCutoff({ nos, slowmo: slowmo && !G.reducedMotion, air: st.bigAir && !G.reducedMotion });
        se.musicLP.frequency.setTargetAtTime(hz, t, hz < 20000 ? 0.06 : 0.25);
      }
    },
  };
  return tuner;
}
