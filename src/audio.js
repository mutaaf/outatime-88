// Synthesized audio engine (Web Audio): engine RPM, SFX, synthwave music loop.
import { SaveStore } from './save.js';
import { GameState } from './state.js';

// UI callbacks live in main.js; it registers them at startup via setAudioHooks().
const hooks = { syncAudioUI() {}, triggerAnnouncement() {} };
export function setAudioHooks(h) { Object.assign(hooks, h); }

export const SoundEngine = {
  ctx: null,
  masterGain: null,
  muted: Boolean(SaveStore.data.muted),
  volume: typeof SaveStore.data.volume === 'number' ? SaveStore.data.volume : 0.8,
  musicTimer: null,
  stepIdx: 0,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
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
  playTone(freq, type, duration, vol = 0.12, slideTo = null) {
    if (this.muted || this.volume <= 0 || !this.ctx || !this.masterGain) return;
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
      gain.connect(this.masterGain);
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
    // Visceral Burnout crunch + rising power chord!
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
  startMusicLoop() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    const bassPattern = [110, 110, 220, 110, 130.81, 130.81, 146.83, 164.81];
    const leadPattern = [440, 523.25, 659.25, 523.25, 587.33, 698.46, 659.25, 493.88];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx || GameState.status !== 'PLAYING') return;
      const isRetro = (GameState.eraIndex === 0);
      const slowMoFactor = GameState.zoneTimer > 0 ? 0.65 : 1.0;
      const bassFreq = bassPattern[this.stepIdx % bassPattern.length] * slowMoFactor;
      const leadFreq = leadPattern[this.stepIdx % leadPattern.length] * slowMoFactor;
      if (bassFreq) {
        this.playTone(
          bassFreq * (GameState.speed > 88 ? 1.122 : 1),
          isRetro ? 'square' : 'sawtooth',
          0.13,
          0.055
        );
      }
      if (leadFreq && (this.stepIdx % 2 === 0 || GameState.speed > 70)) {
        this.playTone(
          leadFreq,
          isRetro ? 'square' : 'triangle',
          0.10,
          0.04
        );
      }
      // Subtle Police Siren chirp at Heat >= 3
      if (GameState.heatLevel >= 3 && this.stepIdx % 8 === 0) {
        this.playTone(680, 'sine', 0.14, 0.035, 920);
      }
      this.stepIdx++;
    }, 155);
  }
};
