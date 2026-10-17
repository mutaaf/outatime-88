// Race ceremony on screen (ticket 0052): lineup cards, the grid, start lights, the finish
// flag and the podium rows. DOM + sound only; the timing and words come from src/racecall.js.
import { SoundEngine } from './audio.js';
import { SaveStore } from './save.js';
import { GameState } from './state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Short spoken call (browser speech, on-device). Off when muted or the voice setting is off. */
export function say(text) {
  const s = SaveStore.data.settings;
  if (!text || SoundEngine.muted || SoundEngine.volume <= 0 || (s && s.voice === false)) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return;
  try {
    synth.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = 1.12; u.pitch = 1.05;
    u.volume = Math.min(1, SoundEngine.volume);
    synth.speak(u);
  } catch (e) { /* speech is a bonus, never an error */ }
}

const beep = (hz, len = 0.16, vol = 0.16, type = 'square') => { try { SoundEngine.playTone(hz, type, len, vol); } catch (e) {} };

/** One rising note per card, so the lineup has a pulse even with the voice off. */
export function cardSting(index) { beep(330 + index * 55, 0.12, 0.1, 'triangle'); }
export function lightBeep() { beep(440, 0.22, 0.17); }
export function goBeep() { beep(880, 0.5, 0.2); }

/** A short fanfare: bright for a win, a podium chord, a cheeky shrug otherwise. */
export function fanfare(place) {
  const notes = place === 1 ? [523, 659, 784, 1047, 784, 1047]
    : place <= 3 ? [440, 554, 659, 880]
      : [392, 370, 349];
  notes.forEach((hz, i) => setTimeout(() => beep(hz, i === notes.length - 1 ? 0.45 : 0.14, 0.14, 'square'), i * 120));
}

function portrait(color, accent) {
  return `<span class="rc-portrait" style="--c1:${esc(color)};--c2:${esc(accent || color)}" aria-hidden="true"><span>🏎️</span></span>`;
}

export const stage = {
  show() { $('raceStage').classList.remove('hidden'); document.body.classList.add('race-starting'); },
  hide() {
    $('raceStage').classList.add('hidden');
    document.body.classList.remove('race-starting');
    for (const id of ['rcCard', 'rcGrid', 'rcLights', 'rcSkip', 'rcFinish']) $(id).classList.add('hidden');
  },
  /** One racer's lineup card. */
  card(racer, call, slot, total) {
    const el = $('rcCard');
    el.classList.remove('hidden', 'rc-pop');
    el.classList.toggle('rc-you', Boolean(racer.isPlayer));
    el.innerHTML = `${portrait(racer.color, racer.accent)}
      <span class="rc-text">
        <span class="rc-tag">${esc(call.tag)} <b>P${slot + 1}/${total}</b></span>
        <span class="rc-name">${esc(call.name)}</span>
        <span class="rc-car">${esc(racer.car || '')}${racer.crew ? ` · ${esc(racer.crew)}` : ''}</span>
      </span>`;
    void el.offsetWidth; // restart the pop-in animation (once per card, not per frame)
    el.classList.add('rc-pop');
    $('rcSkip').classList.remove('hidden');
  },
  /** Everyone together before the lights. */
  grid(field) {
    $('rcCard').classList.add('hidden');
    $('rcSkip').classList.add('hidden');
    const el = $('rcGrid');
    el.innerHTML = field.map((r, i) => `<span class="rc-chip${r.isPlayer ? ' rc-chip-you' : ''}" style="--c1:${esc(r.color)}"><b>P${i + 1}</b> ${esc(r.isPlayer ? 'YOU' : r.short)}</span>`).join('');
    el.classList.remove('hidden');
  },
  /** 3, 2, 1 red lights, then GO. */
  lights(n) {
    $('rcCard').classList.add('hidden');
    $('rcSkip').classList.add('hidden');
    const el = $('rcLights');
    el.classList.remove('hidden');
    el.dataset.state = n === 'go' ? 'go' : String(n);
    $('rcCount').textContent = n === 'go' ? 'GO!' : String(n);
  },
  /** Chequered flag with your place. */
  finish(place, line) {
    for (const id of ['rcCard', 'rcGrid', 'rcLights', 'rcSkip']) $(id).classList.add('hidden');
    const el = $('rcFinish');
    $('rcFinishPlace').textContent = place;
    $('rcFinishLine').textContent = line;
    el.classList.remove('hidden');
    $('raceStage').classList.remove('hidden');
  },
  /** Results podium rows. */
  podium(rows) {
    const list = $('endPodium');
    if (!list) return;
    list.innerHTML = rows.map((r) => `<li class="pod-row${r.isPlayer ? ' pod-you' : ''}${r.place <= 3 ? ` pod-p${r.place}` : ''}">
      <span class="pod-place">${r.place}</span>
      <span class="pod-swatch" style="--c1:${esc(r.color || '#fff')}"></span>
      <span class="pod-name">${esc(r.name)}<small>${esc(r.car || '')}</small></span>
      <span class="pod-time">${esc(r.timeText)}</span></li>`).join('');
  },
};

export const reducedMotion = () => Boolean(GameState.reducedMotion);
