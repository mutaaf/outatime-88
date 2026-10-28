// Settings panel controls (ticket 0050): a lazy chunk fetched the first time the panel opens.
// The tilt engine, motion and sound mix stay in src/settings-ui.js, which hands us `ctx`.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { SoundEngine } from './audio.js';
import { InputState } from './input.js';
import { ACTIONS, applyKeys, bindKey, isDefault, keyName } from './keybinds.js';
import { renderControlsRef } from './controls-ref.js';
import { tiltStatusText } from './tilt-text.js';
import { cameraFxScale } from './camera-fx.js';

export { renderControlsRef }; // the garage draws its copy of the card through this chunk (0204)
/** Both pause sheets' controls cards (0204): the settings pause and the Escape/P garage pause. */
const renderCards = () => { renderControlsRef($('pauseControls')); renderControlsRef($('garageControls')); };

const $ = (id) => document.getElementById(id);

export function createPanel(ctx) {
  const { settings, save, applyAll, toggleTilt, recenterTilt } = ctx;
  // Camera effects (0216): applied when this chunk loads (at boot when the save calms them) and on every change.
  const applyCameraFx = () => { GameState.cameraFx = cameraFxScale(settings().cameraFx); };
  applyCameraFx();

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
    const prox = $('setProximity');
    if (prox) prox.setAttribute('aria-checked', String(s.proximity !== false));
    const coach = $('setCoach');
    if (coach) coach.setAttribute('aria-checked', String(s.coach !== false));
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

  $('setTilt').addEventListener('click', () => toggleTilt().then(renderCards, renderCards));
  $('setTiltInvert').addEventListener('click', () => { settings().tiltInvert = !settings().tiltInvert; save(); syncPanel(); });
  $('setTiltRecenter').addEventListener('click', recenterTilt);
  const voice = $('setVoice');
  if (voice) voice.addEventListener('click', () => {
    settings().voice = !settings().voice;
    if (!settings().voice && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    save(); syncPanel();
  });
  const prox = $('setProximity');
  if (prox) prox.addEventListener('click', () => { settings().proximity = settings().proximity === false; save(); syncPanel(); });
  const coach = $('setCoach');
  if (coach) coach.addEventListener('click', () => {
    settings().coach = settings().coach === false;
    // Off clears a tip or steer prompt already up (under a paused race) now, not on the next frame.
    if (!settings().coach) {
      const tip = $('interactiveCoachBanner');
      if (tip) { tip.style.opacity = '0'; tip.style.pointerEvents = 'none'; }
      const steer = $('steerHint');
      if (steer) steer.classList.add('hidden');
    }
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
      save(); applyAll(); applyCameraFx();
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

  // --- Keyboard (ticket 0013): tap an action, press its key. Conflicts are refused, not swapped.
  applyKeys(InputState, settings().keys); // at load: settings-ui loads this chunk at boot when keys are rebound
  const keysBox = $('setKeys');
  const keysNote = $('setKeysNote');
  let capturing = '';
  let pendingShift = ''; // Shift binds on release, so Shift+Tab (leaving the row) never binds it
  let swallowUp = ''; // the key just bound: its keyup must not also click the focused button (Space does)
  const note = (text) => { if (keysNote) keysNote.textContent = text; };
  function renderKeys() {
    renderCards(); // the pause cards name the keys too (0204)
    if (!keysBox) return;
    const keys = applyKeys(InputState, settings().keys);
    if (!keysBox.firstChild) {
      keysBox.innerHTML = ACTIONS.map((a) => `<div class="set-row"><span>${a.label}${a.fixed.length ? `<small>also ${a.fixed.map(keyName).join(' ')}</small>` : ''}</span>`
        + `<button type="button" class="set-btn key-btn" data-key-action="${a.id}" aria-pressed="false"></button></div>`).join('');
    }
    for (const b of keysBox.querySelectorAll('[data-key-action]')) {
      const a = ACTIONS.find((x) => x.id === b.dataset.keyAction);
      const on = capturing === a.id;
      b.textContent = on ? 'PRESS A KEY…' : keyName(keys[a.id]);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? `Press the new key for ${a.label}` : `${a.label}: ${keyName(keys[a.id])}. Change key`);
    }
  }
  function setKeys(keys) {
    settings().keys = isDefault(keys) ? null : keys;
    save();
    // A key held across the change would keyup under its new meaning and stick.
    InputState.left = InputState.right = InputState.up = InputState.down = InputState.nosHeld = false;
  }
  if (keysBox) {
    keysBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key-action]');
      if (!b) return;
      capturing = capturing === b.dataset.keyAction ? '' : b.dataset.keyAction; // a second tap cancels
      pendingShift = '';
      note(capturing ? 'Press a key. Tap the button again to cancel.' : '');
      renderKeys();
      // Safari and Firefox on macOS don't focus a clicked button; the key must land here.
      if (capturing) b.focus({ preventScroll: true });
    });
    keysBox.addEventListener('keyup', (e) => {
      if (capturing && e.code === pendingShift) { pendingShift = ''; capture(e.code); }
      if (e.code === swallowUp) { e.preventDefault(); swallowUp = ''; }
    });
    keysBox.addEventListener('focusout', () => { if (capturing) { capturing = ''; note(''); renderKeys(); } });
    keysBox.addEventListener('keydown', (e) => {
      if (!capturing) return;
      if (e.code === 'Tab') { pendingShift = ''; return; }
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { pendingShift = e.code; return; }
      pendingShift = '';
      capture(e.code);
    });
  }
  /** Binds the pressed key to the action being captured, or says why it can't. */
  function capture(code) {
    swallowUp = code;
    const a = ACTIONS.find((x) => x.id === capturing);
    const r = bindKey(settings().keys, a.id, code);
    if (r.ok) {
      setKeys(r.keys);
      capturing = '';
      note(`${a.label} is ${keyName(code)} now.`);
    } else {
      note(r.reason === 'taken' ? `${keyName(code)} is already ${r.by}. Pick another key.`
        : r.reason === 'reserved' ? `${keyName(code)} is a game key. Pick another key.`
          : `${keyName(code)} can't drive. Try a letter, a number or Shift.`);
    }
    renderKeys();
  }
  const keysReset = $('setKeysReset');
  if (keysReset) keysReset.addEventListener('click', () => { setKeys(null); capturing = ''; note('Default keys back.'); renderKeys(); });


  return {
    sync: syncPanel,
    tiltText: tiltStatusText,
    open() {
      syncPanel();
      capturing = '';
      note('');
      renderKeys();
      ctx.setTiltStatus(ctx.tiltStatus);
      const done = $('btnSettingsDone');
      if (done) done.textContent = ctx.resumeOnClose || GameState.status === 'PAUSED' ? '▶ RESUME' : '✓ DONE';
      $('settingsModal').classList.remove('hidden');
      if (done) done.focus({ preventScroll: true });
    },
  };
}
