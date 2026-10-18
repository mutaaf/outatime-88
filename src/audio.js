// Audio engine (Web Audio): engine voice, SFX, procedural synthwave score. Recorded CC0 samples,
// the sampled engine and the tyre squeal live in a lazy chunk (src/sfx/bank.js, ticket 0132);
// every sound keeps its synth voice as the fallback until (or unless) its sample decodes.
// Graph (ticket 0006): musicBus / sfxBus / engineBus → compressor → masterGain → destination,
// so stacked crashes and warps duck under a limiter instead of clipping over the music.
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

const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.9;

// UI callbacks live in main.js; it registers them at startup via setAudioHooks().
const hooks = { syncAudioUI() {}, triggerAnnouncement() {} };
export function setAudioHooks(h) { Object.assign(hooks, h); }

// Engine voice per roster shape: [pitch multiplier, growl (>1 deeper sub + darker, <1 brighter)].
const ENGINE_VOICES = {
  GULLWING: [1, 1], MUSCLE: [0.82, 1.3], TUNER_WING: [1.12, 0.9], SCANNER: [0.92, 1.15],
  ROCKET: [1.22, 0.8], HEAVY_VAN: [0.7, 1.4], LIGHTCYCLE: [1.45, 0.7],
};

export const SoundEngine = {
  ctx: null,
  masterGain: null,
  muted: Boolean(SaveStore.data.muted),
  volume: typeof SaveStore.data.volume === 'number' ? SaveStore.data.volume : 0.8,
  // Music and SFX levels from the settings panel (ticket 0050), on top of the master volume.
  musicMix: normalizeSettings(SaveStore.data.settings).musicVolume,
  sfxMix: normalizeSettings(SaveStore.data.settings).sfxVolume,
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
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(ctx.destination);
        this.buildEngineVoice();
        this.loadBank();
      }
    }
    if (this.ctx) {
      if (this.muted && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      } else if (!this.muted && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
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
        if (this.muted && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        } else if (!this.muted && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
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
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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
  },
  enginePitch: 1,
  engineGrowl: 1,
  /** Each roster car sounds like itself: a van rumbles low, a light-cycle whines high. */
  setEngineVoice(shape) {
    const v = ENGINE_VOICES[shape] || ENGINE_VOICES.GULLWING;
    this.enginePitch = v[0];
    this.engineGrowl = v[1];
  },
  /** Called every frame; cheap (three param targets, no allocation). */
  updateEngine(speedMph, playing) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const b = this.bank;
    if (b) {
      b.tyres(playing ? GameState : null, playing && GameState.wallGrind && speedMph > 20 ? Math.min(1, speedMph / 100) : 0);
      b.nos(Boolean(playing && GameState.nosBurning));
      if (b.engine({ rpm: GameState.rpm, gear: GameState.gear, throttle: Boolean(GameState.throttle), playing, pitch: this.enginePitch, growl: this.engineGrowl })) {
        // The recorded engine has taken over: the synth growl goes quiet, the bus envelope stays.
        if (!this.synthEngineOff) { this.synthEngineOff = true; try { this.engineFilter.disconnect(); } catch (e) { /* not connected */ } }
        this.engineBus.gain.setTargetAtTime(playing && this.sfxMix > 0 ? (0.09 + Math.min(1, Math.max(0, speedMph) / 120) * 0.08) * this.sfxMix : 0.0001, t, 0.12);
        return;
      }
    }
    const s = Math.max(0, speedMph);
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
    if (!music) { loadMusic().then(() => this.startMusicLoop(), () => {}); return; }
    if (!this.scheduler) {
      this.scheduler = music.createScheduler(this.ctx, this.musicBus, () => ({
        playing: GameState.status === 'PLAYING' && !this.muted,
        speed: GameState.speed,
        eraId: (ERAS[GameState.eraIndex] || ERAS[0]).id,
        warp: GameState.warpActiveTimer > 0,
      }));
    }
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.scheduler.reset();
    this.musicTimer = setInterval(() => this.scheduler.tick(), 25);
  }
};
