// Settings panel controls (ticket 0050): a lazy chunk fetched the first time the panel opens.
// The tilt engine, motion and sound mix stay in src/settings-ui.js, which hands us `ctx`.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { SoundEngine } from './audio.js';

const $ = (id) => document.getElementById(id);

export function createPanel(ctx) {
  const { settings, save, applyAll, toggleTilt, recenterTilt } = ctx;

  function syncPanel() {
    const s = settings();
    for (const seg of document.querySelectorAll('#settingsModal [data-setting]')) {
      const key = seg.dataset.setting;
      for (const b of seg.querySelectorAll('button[data-value]')) b.setAttribute('aria-pressed', String(b.dataset.value === s[key]));
    }
    const inv = $('setTiltInvert');
    if (inv) inv.setAttribute('aria-checked', String(s.tiltInvert));
    const voice = $('setVoice');
    if (voice) voice.setAttribute('aria-checked', String(s.voice));
    const pairs = [['setMaster', SoundEngine.muted ? 0 : SoundEngine.volume], ['setMusic', s.musicVolume], ['setSfx', s.sfxVolume]];
    for (const [id, v] of pairs) {
      const el = $(id);
      if (el) { el.value = String(Math.round(v * 100)); el.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`); }
    }
    const sens = $('setTiltSens');
    if (sens) sens.value = String(SaveStore.data.tiltSensitivity || 1);
    const sensOut = $('setTiltSensValue');
    if (sensOut) sensOut.textContent = `${Number(SaveStore.data.tiltSensitivity || 1).toFixed(1)}x`;
  }

  $('setTilt').addEventListener('click', () => toggleTilt());
  $('setTiltInvert').addEventListener('click', () => { settings().tiltInvert = !settings().tiltInvert; save(); syncPanel(); });
  $('setTiltRecenter').addEventListener('click', recenterTilt);
  const voice = $('setVoice');
  if (voice) voice.addEventListener('click', () => {
    settings().voice = !settings().voice;
    if (!settings().voice && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    save(); syncPanel();
  });
  $('setTiltSens').addEventListener('input', (e) => {
    SaveStore.data.tiltSensitivity = Math.max(0.4, Math.min(2.2, parseFloat(e.target.value) || 1));
    save(); syncPanel();
  });
  for (const seg of document.querySelectorAll('#settingsModal [data-setting]')) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b) return;
      settings()[seg.dataset.setting] = b.dataset.value;
      save(); applyAll();
    });
  }
  $('setMaster').addEventListener('input', (e) => { SoundEngine.init(); SoundEngine.setVolume(Number(e.target.value) / 100); });
  for (const [id, key] of [['setMusic', 'musicVolume'], ['setSfx', 'sfxVolume']]) {
    $(id).addEventListener('input', (e) => {
      settings()[key] = Number(e.target.value) / 100;
      SoundEngine.setMix(settings().musicVolume, settings().sfxVolume);
      save();
    });
  }


  return {
    sync: syncPanel,
    open() {
      syncPanel();
      ctx.setTiltStatus(ctx.tiltStatus);
      const done = $('btnSettingsDone');
      if (done) done.textContent = ctx.resumeOnClose || GameState.status === 'PAUSED' ? '▶ RESUME' : '✓ DONE';
      $('settingsModal').classList.remove('hidden');
      if (done) done.focus({ preventScroll: true });
    },
  };
}
