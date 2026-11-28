// Settings panel controls (ticket 0050): a lazy chunk fetched the first time the panel opens.
// The tilt engine, motion and sound mix stay in src/settings-ui.js, which hands us `ctx`.
import { SaveStore, freshSaveData } from './save.js';
import { GameState } from './state.js';
import { SoundEngine } from './audio.js';
import { InputState, setLastInput, setPadDead } from './input.js';
import { ACTIONS, applyKeys, bindKey, isDefault, keyName } from './keybinds.js';
import { renderControlsRef } from './controls-ref.js';
import { PAD_ACTIONS, applyPad, bindPad, isDefaultPad, padNames, buttonName } from './padmap.js';
import { tiltStatusText } from './tilt-text.js';
import { cameraFxScale } from './camera-fx.js';
import { deadzoneName, deadzoneOf, stickReadout } from './pad-deadzone.js';
import { rumbleName, testRumble, testText } from './rumble.js';
import { monoOf } from './settings.js';
import { wireFullscreen } from './fullscreen.js';

export { renderControlsRef }; // the garage draws its copy of the card through this chunk (0204)
/** Both pause sheets' controls cards (0204): the settings pause and the Escape/P garage pause. */
const renderCards = () => { renderControlsRef($('pauseControls')); renderControlsRef($('garageControls')); };

const $ = (id) => document.getElementById(id);
let units = null; // src/units.js (0293), its own chunk: the language's pick when no unit is saved

export function createPanel(ctx) {
  const { settings, save, applyAll, toggleTilt, recenterTilt } = ctx;
  // Camera effects (0216): applied when this chunk loads (at boot when the save calms them) and on every change.
  const applyCameraFx = () => { GameState.cameraFx = cameraFxScale(settings().cameraFx); };
  applyCameraFx();
  // Stick deadzone (0299): applied at load (settings-ui loads this chunk at boot when one is saved) and on every change.
  const applyPadDead = () => setPadDead(deadzoneOf(settings().padDead));
  applyPadDead();
  import('./units.js').then((m) => { units = m; syncPanel(); }, () => {});
  wireFullscreen($('setFullscreen')); // 0307: desktop and tablets; stays hidden without the API

  function syncPanel() {
    const s = settings();
    for (const seg of document.querySelectorAll('#settingsModal [data-setting]')) {
      const key = seg.dataset.setting;
      // Units (0293): with no choice saved, the device's language picked (src/units.js sets GameState.kmh).
      const v = key === 'units' ? (units ? units.currentUnits() : s.units || (GameState.kmh ? 'kmh' : 'mph'))
        : key === 'padDead' ? deadzoneName(s.padDead) // unset or junk reads as NORMAL (0299)
        : key === 'rumble' ? rumbleName(s.rumble) // … and as FULL (0300)
        : key === 'fps' ? (String(s.fps) === '30' ? '30' : 'auto') // … and as AUTO (0302; src/frame-cap.js fpsName, not imported: one owner chunk)
        : key === 'mono' ? (monoOf(s) ? 'mono' : 'stereo') : s[key]; // … and as STEREO (0303)
      for (const b of seg.querySelectorAll('button[data-value]')) b.setAttribute('aria-pressed', String(b.dataset.value === v));
    }
    const inv = $('setTiltInvert');
    if (inv) inv.setAttribute('aria-checked', String(s.tiltInvert));
    const voice = $('setVoice');
    if (voice) voice.setAttribute('aria-checked', String(s.voice));
    const prox = $('setProximity');
    if (prox) prox.setAttribute('aria-checked', String(s.proximity !== false));
    const guide = $('setLaneGuide');
    if (guide) guide.setAttribute('aria-checked', String(s.laneGuide === true));
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
  // Lane guide (0219, src/lane-guide.js): opt-in, so only `true` turns it on (no default in main's settings.js).
  const guide = $('setLaneGuide');
  if (guide) guide.addEventListener('click', () => { settings().laneGuide = settings().laneGuide !== true; save(); syncPanel(); renderCards(); });
  const coach = $('setCoach');
  if (coach) coach.addEventListener('click', () => {
    settings().coach = settings().coach === false;
    // Off clears a tip or steer prompt already up (under a paused race) now, not on the next frame.
    if (!settings().coach) {
      const tip = $('interactiveCoachBanner');
      if (tip) { tip.style.opacity = '0'; tip.style.pointerEvents = 'none'; }
      document.body.classList.remove('coach-up');
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
      if (seg.dataset.setting === 'padDead' && b.dataset.value === 'normal') delete settings().padDead; // unset = NORMAL: no boot load
      if (seg.dataset.setting === 'fps' && b.dataset.value !== '30') delete settings().fps; // unset = AUTO (0302)
      if (seg.dataset.setting === 'mono' && b.dataset.value !== 'mono') delete settings().mono; // unset = STEREO (0303)
      if (seg.dataset.setting === 'units') GameState.kmh = b.dataset.value === 'kmh'; // now, not on the next frame
      save(); applyAll(); applyCameraFx(); applyPadDead();
      if (seg.dataset.setting === 'padDead') setRing();
      if (seg.dataset.setting === 'rumble') rumbleRead('');
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


  // --- Gamepad buttons (ticket 0298): pick an action, press its new button on the pad. Conflicts
  // are refused, not swapped. The triggers, START, VIEW, the stick click and the D-pad stay fixed.
  let glyphs = null; // the pad in hand's names (0283), an import()ed import-free chunk
  const padBox = $('setPad');
  const padNote = (text) => { const el = $('setPadNote'); if (el) el.textContent = text; };
  const shown = (t) => (glyphs ? glyphs.padText(t, glyphs.heldFamily(), true) : t);
  const spoken = (t) => (glyphs ? glyphs.padSpoken(shown(t)) : t);
  let padCap = ''; // the action waiting for a button
  let capHeld = null; // buttons already down when the capture began: they must be let go first
  let capRaf = 0;
  const applyPadNow = () => applyPad(InputState, settings().padMap, glyphs);
  applyPadNow(); // at load: settings-ui loads this chunk at boot when buttons are rebound
  import('./pad-glyphs.js').then((m) => { glyphs = m; applyPadNow(); renderPad(); }, () => {});
  function renderPad() {
    if (!padBox) return;
    const names = padNames(applyPadNow());
    if (!padBox.firstChild) {
      padBox.innerHTML = PAD_ACTIONS.map((a) => `<div class="set-row"><span>${a.label}<small data-pad-also="${a.id}"></small></span>`
        + `<button type="button" class="set-btn key-btn" data-pad-action="${a.id}" aria-pressed="false"></button></div>`).join('');
    }
    for (const b of padBox.querySelectorAll('[data-pad-action]')) {
      const a = PAD_ACTIONS.find((x) => x.id === b.dataset.padAction);
      const [main, ...also] = names[a.id].split(' · ');
      const on = padCap === a.id;
      b.textContent = on ? 'PRESS A BUTTON…' : shown(main);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? `Press the new pad button for ${a.label}` : `${a.label}: ${spoken(main)}. Change button`);
      const small = padBox.querySelector(`[data-pad-also="${a.id}"]`);
      if (small) small.textContent = also.length ? `also ${shown(also.join(' '))}` : '';
    }
  }
  function stopPadCap() {
    padCap = ''; capHeld = null;
    InputState.padCapture = false;
    if (capRaf) cancelAnimationFrame(capRaf);
    capRaf = 0;
  }
  function startPadCap(id) {
    stopPadCap();
    padCap = id;
    capHeld = padDown(); // read now, not next frame: a press after this one counts, the A that pressed the row doesn't
    InputState.padCapture = true; // the menu pad (src/home.js) and the pause pad (src/pad-pause.js) stand back
    capRaf = requestAnimationFrame(capLoop);
  }
  /** Every button down on any connected pad right now. */
  function padDown() {
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { /* blocked */ }
    const now = new Set();
    for (const p of pads || []) if (p && p.connected) p.buttons.forEach((x, i) => { if (x && x.pressed) now.add(i); });
    return now;
  }
  function capLoop() {
    capRaf = 0;
    if (!padCap) return;
    if ($('settingsModal').classList.contains('hidden')) { stopPadCap(); renderPad(); return; }
    const now = padDown();
    for (const i of [...capHeld]) if (!now.has(i)) capHeld.delete(i);
    for (const i of now) {
      if (capHeld.has(i)) continue;
      capHeld.add(i);
      padPress(i);
      if (!padCap) return;
    }
    capRaf = requestAnimationFrame(capLoop);
  }
  /** A fresh button while capturing: START cancels; anything else binds or says why it can't. */
  function padPress(i) {
    setLastInput('pad');
    const a = PAD_ACTIONS.find((x) => x.id === padCap);
    if (i === 9) { stopPadCap(); padNote(`Kept ${a.label} as it was.`); renderPad(); return; }
    const r = bindPad(settings().padMap, a.id, i);
    const n = shown(buttonName(i));
    if (r.ok) {
      settings().padMap = isDefaultPad(r.map) ? null : r.map;
      save();
      stopPadCap();
      padNote(`${a.label} is ${n} now.`);
      renderCards(); // the pause cards name the buttons too (0204)
    } else {
      padNote(r.reason === 'taken' ? `${n} is already ${r.by}. Pick another button, or press START to cancel.`
        : r.reason === 'fixed' ? `${n} is ${r.by} and can't move. Pick another button, or press START to cancel.`
          : `That button can't drive. Try ${['A', 'B', 'X', 'Y', 'LB', 'RB', 'RS'].map(shown).join(', ')}.`);
    }
    renderPad();
  }
  if (padBox) {
    padBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pad-action]');
      if (!b) return;
      if (padCap === b.dataset.padAction) { stopPadCap(); padNote(''); } // a second press cancels
      else { startPadCap(b.dataset.padAction); padNote('Press a button on your gamepad. START cancels.'); }
      renderPad();
      if (padCap) b.focus({ preventScroll: true });
    });
    padBox.addEventListener('focusout', (e) => {
      if (padCap && !padBox.contains(e.relatedTarget)) { stopPadCap(); padNote(''); renderPad(); }
    });
  }
  // --- Stick deadzone preview (0299): a dot that follows the left stick over a ring at the chosen
  // radius, so a drifting stick shows. Runs only while the panel is open; nothing per race frame.
  const deadView = $('setPadDeadView');
  const deadDot = deadView && deadView.querySelector('.pdz-dot');
  const deadRead = $('setPadDeadRead');
  let deadRaf = 0;
  let lastRead = '';
  let lastX = NaN, lastPad = null, deadR = 0;
  // Steering reads the left stick's X only (src/input.js), so the dot moves on X: inside the ring = no steer.
  const setRing = () => { if (deadView) deadView.style.setProperty('--dz', String(deadzoneOf(settings().padDead))); lastX = NaN; };
  // While the preview is on screen the menu pad (src/home.js) moves on the D-pad only, so trying the stick doesn't move the focus.
  const seen = deadView && typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { InputState.padPreview = es[es.length - 1].isIntersecting && !!deadRaf; }) : null;
  function drawDead() {
    deadRaf = 0;
    if (!deadView || $('settingsModal').classList.contains('hidden')) { InputState.padPreview = false; return; }
    let pad = null;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : null; if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; } } catch (e) { /* blocked */ }
    const x = pad ? Math.max(-1, Math.min(1, pad.axes[0] || 0)) : 0;
    if (x !== lastX || Boolean(pad) !== lastPad) { // writes only when the stick or the choice changed
      const dead = deadzoneOf(settings().padDead);
      lastX = x; lastPad = Boolean(pad);
      deadDot.style.transform = `translateX(${(x * deadR).toFixed(1)}px)`;
      deadView.dataset.pad = String(lastPad);
      deadView.dataset.in = String(lastPad && Math.abs(x) <= dead);
      const text = pad ? stickReadout(x, 0, dead) : 'Connect a gamepad to see its left stick here.';
      if (text !== lastRead && deadRead) deadRead.textContent = lastRead = text;
    }
    deadRaf = requestAnimationFrame(drawDead);
  }
  const startDead = () => {
    if (!deadView || deadRaf) return;
    setRing();
    deadR = deadView.clientWidth / 2; // once per open: the box is a fixed size
    drawDead();
    if (seen) { seen.disconnect(); seen.observe(deadView); }
  };

  // --- Gamepad rumble (0300): OFF / LOW / FULL is read live by src/forcefeel.js; TEST buzzes 300 ms at the choice.
  const rumbleRead = (t) => { const el = $('setRumbleRead'); if (el) el.textContent = t; };
  const rumbleTest = $('setRumbleTest');
  if (rumbleTest) rumbleTest.addEventListener('click', () => rumbleRead(testText(testRumble(settings().rumble), settings().rumble)));

  const padReset = $('setPadReset');
  if (padReset) padReset.addEventListener('click', () => {
    stopPadCap(); settings().padMap = null; save(); padNote('Default buttons back.'); renderPad(); renderCards();
  });

  // Career stats (0278): five read-only counters from the save, drawn fresh on every open.
  // Its own import-free chunk, shared with race-flow (a static import would grow main's preload map).
  function renderStats() {
    const sec = $('setStats');
    import('./career-stats.js').then(({ statRows }) => { if (sec) sec.hidden = false; fillStats(statRows(SaveStore.data)); })
      .catch(() => { if (sec) sec.hidden = true; }); // never an empty heading
  }
  function fillStats(rows) {
    const dl = $('statsList');
    if (!dl) return;
    dl.replaceChildren(...rows.map(([label, value]) => {
      const cell = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      cell.append(dt, dd);
      return cell;
    }));
  }

  // --- Save backup (0296): copy the save as a code, paste one back. Its own import-free chunk,
  // fetched as the panel opens so a COPY tap can write the clipboard inside the tap (Safari asks).
  let backup = null;
  let pending = null; // a decoded save waiting for REPLACE MY SAVE
  const loadBackup = () => import('./save-backup.js').then((m) => (backup = m));
  const bmsg = (text, tone = '') => { const el = $('saveBackupMsg'); if (el) { el.textContent = text; el.dataset.tone = tone; } };
  const showConfirm = (on) => { const box = $('saveRestoreConfirm'); if (box) box.classList.toggle('hidden', !on); };
  function copyCode(m) {
    const code = m.encodeSave(SaveStore.data);
    const out = $('saveCodeOut');
    out.value = code;
    for (const el of document.querySelectorAll('#setBackup .save-code-out')) el.classList.remove('hidden');
    // iOS ignores select() on a readonly box; a selection range works everywhere.
    // Only take focus if the player is still on COPY: the clipboard answers later, and focus that
    // moved on (to the paste box, say) must not be pulled back. Selecting needs no focus.
    const shown = () => {
      if (document.activeElement === $('btnSaveCopy')) out.focus({ preventScroll: false });
      out.setSelectionRange(0, code.length);
    };
    const clip = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(code) : Promise.reject();
    clip.then(() => bmsg('Save code copied. Paste it somewhere safe, like a note or a message to yourself.', 'ok'),
      () => { shown(); bmsg('Copy the code from the box above (it is selected) and keep it somewhere safe.'); });
  }
  const copyBtn = $('btnSaveCopy');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    if (backup) copyCode(backup);
    else loadBackup().then(copyCode, () => bmsg('Backup is not available offline yet. Try again online.', 'bad'));
  });
  const restoreBtn = $('btnSaveRestore');
  if (restoreBtn) restoreBtn.addEventListener('click', () => loadBackup().then((m) => {
    const r = m.decodeSave($('saveCodeIn').value);
    pending = r.ok ? r.data : null;
    showConfirm(r.ok);
    if (!r.ok) { bmsg(m.REASON_TEXT[r.reason], 'bad'); return; }
    bmsg('');
    $('saveRestoreAsk').textContent = `Replace this save (${m.describeSave(SaveStore.data)}) with the code's (${m.describeSave(r.data)})? The game reloads${GameState.status === 'PAUSED' ? ' and this race ends' : ''}.`;
    $('btnSaveRestoreNo').focus({ preventScroll: true });
  }, () => bmsg('Backup is not available offline yet. Try again online.', 'bad')));
  const yes = $('btnSaveRestoreYes');
  if (yes) yes.addEventListener('click', () => {
    if (!pending || !backup) return;
    if (!backup.restoreSave(SaveStore, pending, () => location.reload(), freshSaveData)) {
      bmsg("This browser won't let the game save right now (private window or full storage). Your save is unchanged.", 'bad');
    }
  });
  const no = $('btnSaveRestoreNo');
  if (no) no.addEventListener('click', () => { pending = null; showConfirm(false); bmsg('Kept your save.'); restoreBtn.focus({ preventScroll: true }); });
  const codeIn = $('saveCodeIn');
  if (codeIn) codeIn.addEventListener('input', () => { pending = null; showConfirm(false); }); // a new paste asks again

  return {
    sync: syncPanel,
    tiltText: tiltStatusText,
    open() {
      syncPanel();
      renderStats();
      loadBackup().catch(() => {});
      pending = null; showConfirm(false); bmsg('');
      capturing = '';
      note('');
      renderKeys();
      stopPadCap(); padNote('');
      renderPad();
      ctx.setTiltStatus(ctx.tiltStatus);
      const done = $('btnSettingsDone');
      if (done) done.textContent = ctx.resumeOnClose || GameState.status === 'PAUSED' ? '▶ RESUME' : '✓ DONE';
      $('settingsModal').classList.remove('hidden');
      startDead(); rumbleRead(''); // a fresh TEST line each open (0300)
      if (done) done.focus({ preventScroll: true });
    },
  };
}
