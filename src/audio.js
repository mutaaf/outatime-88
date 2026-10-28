// Audio engine (Web Audio): engine voice, SFX, procedural synthwave score. Recorded CC0 samples,
// the sampled engine and the tyre squeal live in a lazy chunk (src/sfx/bank.js, ticket 0133);
// every sound keeps its synth voice as the fallback until (or unless) its sample decodes.
// Graph (ticket 0006): musicBus / sfxBus / engineBus → compressor → limiter → masterGain →
// destination, so stacked crashes and warps duck under a limiter instead of clipping over the
// music. Ticket 0193 adds two lazy chunks, both fully synthesized: the street-tuner layer
// (src/sfx/tuner.js) and the street score + music director (src/street-score.js), which plays
// through musicIn → musicLP (NOS-tunnel / slow-mo mood filter) → musicDuck → musicBus.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { ERAS } from './data.js';
import { normalizeSettings } from './settings.js';

// The score is its own chunk (ticket 0115): main.js preloads it right after boot, long before
// the first race starts the loop, so the music is never late; the engine and SFX never wait.
let music = null;
let musicLoading = null;
export function loadMusic() {
  if (!musicLoading) musicLoading = import('./music.js').then((m) => (music = m), (e) => { musicLoading = null; throw e; });
  return musicLoading;
}
// The street score and the director that picks synthwave or street (0193); synthwave alone if it fails.
let score = null;
const loadScore = () => import('./street-score.js').then((m) => (score = m), () => null);

const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.9;

// UI callbacks live in main.js; it registers them at startup via setAudioHooks().
const hooks = { syncAudioUI() {}, triggerAnnouncement() {} };
export function setAudioHooks(h) { Object.assign(hooks, h); }

// Engine voice per roster shape: [pitch multiplier, growl (>1 deeper sub + darker, <1 brighter)].
const ENGINE_VOICES = {
  GULLWING: [1, 1], MUSCLE: [0.82, 1.3], TUNER_WING: [1.12, 0.9], SCANNER: [0.92, 1.15],
  ROCKET: [1.22, 0.8], HEAVY_VAN: [0.7, 1.4], LIGHTCYCLE: [1.45, 0.7],
  ROADSTER: [1, 1, true], // electric: a motor whine, not an engine (no recorded engine loop)
};

export const SoundEngine = {
  ctx: null,
  masterGain: null,
  muted: Boolean(SaveStore.data.muted),
  volume: typeof SaveStore.data.volume === 'number' ? SaveStore.data.volume : 0.8,
  // Music and SFX levels from the settings panel (ticket 0050), on top of the master volume.
  musicMix: normalizeSettings(SaveStore.data.settings).musicVolume,
  sfxMix: normalizeSettings(SaveStore.data.settings).sfxVolume,
  musicStyle: normalizeSettings(SaveStore.data.settings).musicStyle,
  tuner: null,
  shape: 'GULLWING',
  carName: '',
  musicTimer: null,
  scheduler: null,
  musicBus: null,
  sfxBus: null,
  engineBus: null,
  compressor: null,
  engineOsc: null,
  engineSub: null,
  engineFilter: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        this.ctx = ctx;
        this.masterGain = ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, ctx.currentTime);
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, ctx.currentTime);
        this.compressor.knee.setValueAtTime(10, ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.004, ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, ctx.currentTime);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.setValueAtTime(MUSIC_LEVEL * this.musicMix, ctx.currentTime);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.setValueAtTime(SFX_LEVEL * this.sfxMix, ctx.currentTime);
        this.engineBus = ctx.createGain();
        this.engineBus.gain.setValueAtTime(0.0001, ctx.currentTime);
        for (const bus of [this.musicBus, this.sfxBus, this.engineBus]) bus.connect(this.compressor);
        // A fast, high-ratio stage after the glue compressor: nothing past it ever clips.
        const lim = this.limiter = ctx.createDynamicsCompressor();
        lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
        this.compressor.connect(lim);
        lim.connect(this.masterGain);
        this.masterGain.connect(ctx.destination);
        this.buildEngineVoice();
        this.loadBank();
        // A call, Siri, an alarm or a lock screen ('interrupted' on iOS) or the browser can put the
        // context to sleep: wake it when it changes state, when the tab is back, or on the next
        // touch or key (iOS wants a gesture, and a touch only counts on its way up). Hiding the tab
        // puts it to sleep; mute always wins (0212). Gamepad-only play recovers on return to the tab.
        ctx.onstatechange = () => this.wake();
        const wake = () => this.wake(false); // the page is in use again
        for (const t of ['pointerup', 'keydown']) window.addEventListener(t, wake, true);
        document.addEventListener('visibilitychange', wake);
      }
    }
    this.wake();
  },
  /** Match the context to the moment: muted, in a hidden tab or away (`wake(true)`: the page
   *  is going, until a `wake(false)` from the tab, a touch or a key) it sleeps (0032); otherwise
   *  a context left 'suspended' or 'interrupted' resumes (0212). The ONLY place that suspends or
   *  resumes it: its own statechange calls this, so a suspend anywhere else is undone at once. */
  wake(away = this.away) {
    const c = this.ctx, s = c?.state;
    if ((this.away = away) || this.muted || document.hidden) { if (s === 'running') c.suspend().catch(() => {}); }
    else if (s === 'suspended' || s === 'interrupted') c.resume().catch(() => {});
  },
  setMuted(muteVal) {
    this.muted = Boolean(muteVal);
    SaveStore.data.muted = this.muted;
    SaveStore.save();
    if (this.muted && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    if (this.ctx && this.masterGain) {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.wake();
      } catch (e) {}
    }
    hooks.syncAudioUI();
  },
  toggleMute() {
    this.setMuted(!this.muted);
    hooks.triggerAnnouncement(
      this.muted ? '🔇 SOUND MUTED' : '🔊 SOUND UNMUTED',
      'PRESS M OR TAP SOUND BUTTON ANYTIME TO TOGGLE',
      1000
    );
  },
  setVolume(vol0to1) {
    this.volume = Math.max(0, Math.min(1, vol0to1));
    SaveStore.data.volume = this.volume;
    if (this.volume === 0) {
      this.setMuted(true);
      return;
    }
    if (this.muted) {
      this.muted = false;
      SaveStore.data.muted = false;
    }
    SaveStore.save();
    if (this.ctx && this.masterGain) {
      try {
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.wake();
      } catch (e) {}
    }
    hooks.syncAudioUI();
  },
  /** Music and effects levels (0..1 each); applied live to the buses. */
  setMix(music, sfx) {
    this.musicMix = Math.max(0, Math.min(1, music));
    this.sfxMix = Math.max(0, Math.min(1, sfx));
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL * this.musicMix, t, 0.03);
      this.sfxBus.gain.setTargetAtTime(SFX_LEVEL * this.sfxMix, t, 0.03);
    }
  },
  bank: null,
  /** Fetch the recorded samples in the background once there's an AudioContext. */
  loadBank() {
    if (this.bankLoading || !this.ctx) return;
    import('./sfx/tuner.js').then((m) => { this.tuner = m.createTuner(this.ctx, this); this.tuner.setCharacter(this.shape, this.carName); }, () => {});
    this.bankLoading = import('./sfx/bank.js').then((m) => {
      this.bank = m.createBank(this.ctx, { sfx: this.sfxBus, engine: this.engineBus });
      m.bindUiClicks(document, () => { if (GameState.status !== 'PLAYING') this.sample('click', 0.95 + Math.random() * 0.1); });
      return this.bank.load();
    }).catch(() => { this.bankLoading = null; });
  },
  /** Play a recorded sample if it's decoded; false means the caller should use its synth voice. */
  sample(name, rate = 1, gain = 1) {
    if (this.muted || this.volume <= 0 || !this.bank) return false;
    return this.bank.play(name, rate, gain);
  },
  /** An impact: a recorded hit, or the old synth thud. */
  playImpact(name, freq, dur, vol) {
    if (!this.sample(name, 0.9 + Math.random() * 0.2)) this.playTone(freq, name === 'cone' || name === 'debris' ? 'square' : 'sawtooth', dur, vol);
  },
  /** Start lights (go = the green light). */
  playBeep(go) {
    this.tuner?.beep(go);
    if (!this.sample('beep', go ? 2 : 1, go ? 1.1 : 0.9)) this.playTone(go ? 880 : 440, 'square', go ? 0.5 : 0.22, go ? 0.2 : 0.17);
  },
  playLand() { if (!this.sample('land')) this.playCrash(); },
  playWhoosh() { this.sample('whoosh'); },
  playStartUp() { this.sample('start'); },
  // Two detuned saws through a lowpass: a growl whose pitch and brightness track speed.
  buildEngineVoice() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(400, ctx.currentTime);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(48, ctx.currentTime);
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.setValueAtTime(24, ctx.currentTime);
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineBus);
    this.engineOsc.start(ctx.currentTime);
    this.engineSub.start(ctx.currentTime);
    this.applyVoiceType();
  },
  enginePitch: 1,
  engineGrowl: 1,
  /** Each roster car sounds like itself: a van rumbles low, a light-cycle whines high. */
  setEngineVoice(shape, carName = '') {
    this.shape = shape;
    this.carName = carName;
    this.tuner?.setCharacter(shape, carName);
    const v = ENGINE_VOICES[shape] || ENGINE_VOICES.GULLWING;
    this.enginePitch = v[0];
    this.engineGrowl = v[1];
    this.electric = Boolean(v[2]);
    this.applyVoiceType();
  },
  electric: false,
  /** An electric car whines (sine + triangle); everything else growls (saw + square). */
  applyVoiceType() {
    if (!this.engineOsc) return;
    this.engineOsc.type = this.electric ? 'sine' : 'sawtooth';
    this.engineSub.type = this.electric ? 'triangle' : 'square';
  },
  /** Called every frame; cheap (param targets, no allocation). */
  updateEngine(speedMph, playing) {
    if (!this.ctx || !this.engineOsc) return;
    this.engineFrame(speedMph, playing);
    this.tuner?.frame(GameState, playing, hooks.world);
    // The title gets its calm loop once sound is unlocked (the director plays it, 0193).
    if (!this.musicTimer && !this.musicPending && !this.titleLoopOff && !this.muted && this.ctx.state === 'running' && GameState.status === 'TITLE') this.startMusicLoop();
  },
  /** A hit's Δv (world Z/s, src/rigid.js): a metal crunch scaled by it. */
  crunch(dv) { this.tuner?.crunch(dv); },
  setMusicStyle(style) { this.musicStyle = style; },
  engineFrame(speedMph, playing) {
    const t = this.ctx.currentTime;
    const b = this.bank;
    if (b) {
      b.tyres(playing ? GameState : null, playing && GameState.wallGrind && speedMph > 20 ? Math.min(1, speedMph / 100) : 0);
      b.nos(Boolean(playing && GameState.nosBurning));
      // (An electric car mutes the recorded engine and keeps its synth whine.)
      if (b.engine({ rpm: GameState.rpm, gear: GameState.gear, throttle: Boolean(GameState.throttle), playing: playing && !this.electric, pitch: this.enginePitch, growl: this.engineGrowl }) && !this.electric) {
        // The recorded engine has taken over: the synth growl goes quiet, the bus envelope stays.
        if (!this.synthEngineOff) { this.synthEngineOff = true; try { this.engineFilter.disconnect(); } catch (e) { /* not connected */ } }
        this.engineBus.gain.setTargetAtTime(playing && this.sfxMix > 0 ? (0.09 + Math.min(1, Math.max(0, speedMph) / 120) * 0.08) * this.sfxMix : 0.0001, t, 0.12);
        return;
      }
    }
    if (this.synthEngineOff) { this.synthEngineOff = false; this.engineFilter.connect(this.engineBus); }
    const s = Math.max(0, speedMph);
    if (this.electric) {
      // One smooth rising motor whine with an inverter overtone: no gears, no rumble.
      const hz = 150 + s * 10;
      this.engineOsc.frequency.setTargetAtTime(hz, t, 0.06);
      this.engineSub.frequency.setTargetAtTime(hz * 1.5, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(5200, t, 0.08);
      this.engineBus.gain.setTargetAtTime(playing && this.sfxMix > 0 ? (0.03 + Math.min(1, s / 120) * 0.05) * this.sfxMix : 0.0001, t, 0.12);
      return;
    }
    // Gear-ish sawtooth on top of a smooth climb, so it revs, shifts and revs again.
    const gearPhase = (s % 26) / 26;
    const hz = (42 + s * 0.9 + gearPhase * 38) * this.enginePitch;
    this.engineOsc.frequency.setTargetAtTime(hz, t, 0.05);
    this.engineSub.frequency.setTargetAtTime(hz / (this.engineGrowl > 1 ? 3 : 2), t, 0.05);
    this.engineFilter.frequency.setTargetAtTime((300 + s * 18) * (this.engineGrowl > 1 ? 0.8 : this.engineGrowl < 1 ? 1.3 : 1), t, 0.08);
    this.engineBus.gain.setTargetAtTime(playing && this.sfxMix > 0 ? (0.05 + Math.min(1, s / 120) * 0.07) * this.sfxMix : 0.0001, t, 0.12);
  },
  playTone(freq, type, duration, vol = 0.12, slideTo = null) {
    if (this.muted || this.volume <= 0 || !this.ctx || !this.sfxBus) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(24, freq), now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), now + duration);
      }
      const scaledVol = Math.max(0.001, vol * this.volume);
      gain.gain.setValueAtTime(scaledVol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  },
  playBoosterHit() {
    if (this.sample('booster')) return;
    this.playTone(260, 'sawtooth', 0.24, 0.15, 920);
    setTimeout(() => this.playTone(540, 'square', 0.2, 0.12, 1320), 55);
  },
  playCoinPickup() {
    if (this.sample('coin', 0.96 + Math.random() * 0.08)) return;
    this.playTone(587.33, 'square', 0.08, 0.12);
    setTimeout(() => this.playTone(880, 'square', 0.15, 0.13), 65);
  },
  playTakedown() {
    this.tuner?.duck(0.5, 0.4);
    if (this.sample('takedown')) { this.sample('crash2', 0.85); return; }
    // Visceral takedown crunch + rising power chord!
    this.playTone(95, 'sawtooth', 0.35, 0.24, 42);
    setTimeout(() => this.playTone(392, 'sawtooth', 0.28, 0.18, 784), 80);
    setTimeout(() => this.playTone(587.33, 'square', 0.35, 0.16, 1174), 160);
  },
  playAbilityRoar() {
    if (this.sample('roar')) return;
    this.playTone(180, 'sawtooth', 0.5, 0.24, 45);
    setTimeout(() => this.playTone(440, 'triangle', 0.4, 0.18, 880), 60);
  },
  playAbilityZone() {
    if (this.sample('zone')) return;
    this.playTone(660, 'sine', 0.35, 0.18, 220);
  },
  playTimeWarp88() {
    if (this.sample('warp', 0.8)) { this.sample('whoosh', 1.3, 0.7); return; }
    this.playTone(140, 'sawtooth', 0.55, 0.22, 1600);
    setTimeout(() => this.playTone(300, 'triangle', 0.65, 0.2, 60), 150);
    setTimeout(() => {
      this.playTone(523.25, 'sawtooth', 0.45, 0.15);
      this.playTone(659.25, 'sawtooth', 0.45, 0.15);
      this.playTone(783.99, 'sawtooth', 0.55, 0.15);
    }, 320);
  },
  /** Endless tier up (ticket 0150): a bright rising arpeggio over the checkpoint chime. */
  playLevelUp() {
    this.tuner?.levelUp();
    if (this.sample('checkpoint', 1.25)) { this.sample('whoosh', 0.8, 0.6); return; }
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => setTimeout(() => this.playTone(n, 'square', 0.16, 0.13), i * 70));
  },
  playCheckpoint() {
    if (this.sample('checkpoint')) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 'square', 0.14, 0.14), idx * 60);
    });
  },
  playStunt() {
    if (this.sample('stunt')) return;
    this.playTone(330, 'triangle', 0.2, 0.15, 990);
    setTimeout(() => this.playTone(660, 'square', 0.25, 0.14, 1320), 85);
  },
  /** Two-tone car horn (touch HONK button, ticket 0061). */
  playHorn() {
    if (this.sample('horn')) return;
    this.playTone(392, 'square', 0.32, 0.09);
    this.playTone(494, 'square', 0.32, 0.07);
  },
  playCrash() {
    if (this.sample(Math.random() < 0.5 ? 'crash' : 'crash2', 0.9 + Math.random() * 0.2)) return;
    this.playTone(130, 'sawtooth', 0.32, 0.2, 32);
  },
  // Procedural score (ticket 0010): src/music.js schedules notes ~120 ms ahead on the
  // audio clock; this interval only wakes the scheduler, so main-thread jank can't smear timing.
  startMusicLoop() {
    if (!this.ctx || !this.musicBus) return;
    if (!music || !this.scoreTried) {
      if (this.musicPending) return;
      this.musicPending = true;
      Promise.all([loadMusic(), loadScore()]).then(() => { this.scoreTried = true; this.musicPending = false; this.startMusicLoop(); },
        () => { this.musicPending = false; this.titleLoopOff = true; });
      return;
    }
    if (!this.scheduler) {
      this.scheduler = score ? score.createMusic(this, GameState, music) : music.createScheduler(this.ctx, this.musicBus, () => ({
        playing: GameState.status === 'PLAYING' && !this.muted,
        speed: GameState.speed,
        eraId: (ERAS[GameState.eraIndex] || ERAS[0]).id,
        warp: GameState.warpActiveTimer > 0,
        warps: GameState.timeWarps,
      }));
    }
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.scheduler.reset();
    this.musicTimer = setInterval(() => this.scheduler.tick(), 25);
  }
};
