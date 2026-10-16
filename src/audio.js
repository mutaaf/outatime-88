// Synthesized audio engine (Web Audio): engine voice, SFX, procedural synthwave score.
// Graph (ticket 0006): musicBus / sfxBus / engineBus → compressor → masterGain → destination,
// so stacked crashes and warps duck under a limiter instead of clipping over the music.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { ERAS } from './data.js';
import { createScheduler } from './music.js';

// UI callbacks live in main.js; it registers them at startup via setAudioHooks().
const hooks = { syncAudioUI() {}, triggerAnnouncement() {} };
export function setAudioHooks(h) { Object.assign(hooks, h); }

export const SoundEngine = {
  ctx: null,
  masterGain: null,
  muted: Boolean(SaveStore.data.muted),
  volume: typeof SaveStore.data.volume === 'number' ? SaveStore.data.volume : 0.8,
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
        this.musicBus.gain.setValueAtTime(0.55, ctx.currentTime);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.setValueAtTime(0.9, ctx.currentTime);
        this.engineBus = ctx.createGain();
        this.engineBus.gain.setValueAtTime(0.0001, ctx.currentTime);
        for (const bus of [this.musicBus, this.sfxBus, this.engineBus]) bus.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(ctx.destination);
        this.buildEngineVoice();
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
  /** Called every frame; cheap (three param targets, no allocation). */
  updateEngine(speedMph, playing) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0, speedMph);
    // Gear-ish sawtooth on top of a smooth climb, so it revs, shifts and revs again.
    const gearPhase = (s % 26) / 26;
    const hz = 42 + s * 0.9 + gearPhase * 38;
    this.engineOsc.frequency.setTargetAtTime(hz, t, 0.05);
    this.engineSub.frequency.setTargetAtTime(hz / 2, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + s * 18, t, 0.08);
    this.engineBus.gain.setTargetAtTime(playing ? 0.05 + Math.min(1, s / 120) * 0.07 : 0.0001, t, 0.12);
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
    this.playTone(260, 'sawtooth', 0.24, 0.15, 920);
    setTimeout(() => this.playTone(540, 'square', 0.2, 0.12, 1320), 55);
  },
  playCoinPickup() {
    this.playTone(587.33, 'square', 0.08, 0.12);
    setTimeout(() => this.playTone(880, 'square', 0.15, 0.13), 65);
  },
  playTakedown() {
    // Visceral takedown crunch + rising power chord!
    this.playTone(95, 'sawtooth', 0.35, 0.24, 42);
    setTimeout(() => this.playTone(392, 'sawtooth', 0.28, 0.18, 784), 80);
    setTimeout(() => this.playTone(587.33, 'square', 0.35, 0.16, 1174), 160);
  },
  playAbilityRoar() {
    this.playTone(180, 'sawtooth', 0.5, 0.24, 45);
    setTimeout(() => this.playTone(440, 'triangle', 0.4, 0.18, 880), 60);
  },
  playAbilityZone() {
    this.playTone(660, 'sine', 0.35, 0.18, 220);
  },
  playTimeWarp88() {
    this.playTone(140, 'sawtooth', 0.55, 0.22, 1600);
    setTimeout(() => this.playTone(300, 'triangle', 0.65, 0.2, 60), 150);
    setTimeout(() => {
      this.playTone(523.25, 'sawtooth', 0.45, 0.15);
      this.playTone(659.25, 'sawtooth', 0.45, 0.15);
      this.playTone(783.99, 'sawtooth', 0.55, 0.15);
    }, 320);
  },
  playCheckpoint() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 'square', 0.14, 0.14), idx * 60);
    });
  },
  playStunt() {
    this.playTone(330, 'triangle', 0.2, 0.15, 990);
    setTimeout(() => this.playTone(660, 'square', 0.25, 0.14, 1320), 85);
  },
  playCrash() {
    this.playTone(130, 'sawtooth', 0.32, 0.2, 32);
  },
  // Procedural score (ticket 0010): src/music.js schedules notes ~120 ms ahead on the
  // audio clock; this interval only wakes the scheduler, so main-thread jank can't smear timing.
  startMusicLoop() {
    if (!this.ctx || !this.musicBus) return;
    if (!this.scheduler) {
      this.scheduler = createScheduler(this.ctx, this.musicBus, () => ({
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
