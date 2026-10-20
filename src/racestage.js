// Race ceremony on screen (ticket 0052): lineup cards, the grid, start lights, the finish
// flag and the podium rows. DOM + sound only; the timing and words come from src/racecall.js.
import { SoundEngine } from './audio.js';
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { InputState } from './input.js';
import { finishResults, resultHeadline, lineupCall, startHint } from './racecall.js';
import { carPortrait } from './car-sprite.js';

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

// The input in hand (ticket 0111): the last key, mouse or touch wins (gamepads are noted by
// pollGamepad). Mouse counts as keyboard: a desktop player's hands are on the keys.
window.addEventListener('keydown', () => { InputState.lastInput = 'keys'; }, true);
window.addEventListener('pointerdown', (e) => { InputState.lastInput = e.pointerType === 'mouse' ? 'keys' : 'touch'; }, true);
window.addEventListener('gamepadconnected', () => { InputState.lastInput = 'pad'; });
const hint = () => startHint(InputState.lastInput, window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys');

const beep = (hz, len = 0.16, vol = 0.16, type = 'square') => { try { SoundEngine.playTone(hz, type, len, vol); } catch (e) {} };

/** One rising note per card, so the lineup has a pulse even with the voice off. */
export function cardSting(index) { beep(330 + index * 55, 0.12, 0.1, 'triangle'); }
export function lightBeep() { try { SoundEngine.playBeep(false); } catch (e) {} }
export function goBeep() { try { SoundEngine.playBeep(true); } catch (e) {} }

/** A short fanfare: bright for a win, a podium chord, a cheeky shrug otherwise. */
export function fanfare(place) {
  const notes = place === 1 ? [523, 659, 784, 1047, 784, 1047]
    : place <= 3 ? [440, 554, 659, 880]
      : [392, 370, 349];
  notes.forEach((hz, i) => setTimeout(() => beep(hz, i === notes.length - 1 ? 0.45 : 0.14, 0.14, 'square'), i * 120));
}

/** A racer's car look { shape, body, cabin, glow } (racers carry it; rigid bodies carry the parts). */
export function lookOf(r) {
  if (!r) return null;
  if (r.look && r.look.shape) return r.look;
  return r.shape ? { shape: r.shape, body: r.bodyColor || r.body, cabin: r.accentColor || r.cabin, glow: r.underglow || r.color } : null;
}

function carImg(look, w, cls) {
  const url = look ? carPortrait(look, w) : '';
  return url ? `<img class="${cls}" src="${url}" alt="" draggable="false">` : '';
}

function portrait(color, accent, look) {
  const img = carImg(look, 160, 'rc-car-art');
  return `<span class="rc-portrait${img ? ' has-car' : ''}" style="--c1:${esc(color)};--c2:${esc(accent || color)}" aria-hidden="true">${img || '<span>🏎️</span>'}</span>`;
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
    el.innerHTML = `${portrait(racer.color, racer.accent, lookOf(racer))}
      <span class="rc-text">
        <span class="rc-tag">${esc(call.tag)} <b>P${slot + 1}/${total}</b></span>
        <span class="rc-name">${esc(call.name)}</span>
        <span class="rc-car">${esc(racer.car || '')}${racer.crew ? ` · ${esc(racer.crew)}` : ''}</span>
        ${racer.cls ? `<span class="rc-spec">${esc(racer.cls)}${racer.specLine ? ` · ${esc(racer.specLine)}` : ''}</span>` : ''}
      </span>`;
    void el.offsetWidth; // restart the pop-in animation (once per card, not per frame)
    el.classList.add('rc-pop');
    $('rcSkip').textContent = hint().skip;
    $('rcSkip').classList.remove('hidden');
  },
  /** Everyone together before the lights. */
  grid(field) {
    $('rcCard').classList.add('hidden');
    $('rcSkip').classList.add('hidden');
    const el = $('rcGrid');
    const me = field.find((r) => r.isPlayer);
    // One compact row of six chips (ticket 0111): place, initials and colour, the road stays in view.
    el.innerHTML = field.map((r, i) => `<span class="rc-chip${r.isPlayer ? ' rc-chip-you' : ''}" style="--c1:${esc(r.color)}"><b>P${i + 1}</b> ${esc(r.isPlayer ? 'YOU' : r.short)}</span>`).join('')
      + (me && me.cls ? `<span class="rc-mycar">${esc(me.car || '')} · <b>${esc(me.cls)}</b>${me.specLine ? ` · ${esc(me.specLine)}` : ''}</span>` : '');
    el.classList.remove('hidden');
  },
  /** 3, 2, 1 red lights, then GO. */
  lights(n) {
    $('rcCard').classList.add('hidden');
    $('rcSkip').classList.add('hidden');
    const el = $('rcLights');
    el.classList.remove('hidden');
    el.dataset.state = n === 'go' ? 'go' : String(n);
    if (n === 3) $('rcHint').textContent = hint().launch;
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
      <span class="pod-swatch" style="--c1:${esc(r.color || '#fff')}"></span><span class="pod-carbox">${carImg(lookOf(r), 72, 'pod-car')}</span>
      <span class="pod-name">${esc(r.name)}<small>${esc(r.car || '')}</small></span>
      <span class="pod-time">${esc(r.timeText)}</span></li>`).join('');
  },
};

export const reducedMotion = () => Boolean(GameState.reducedMotion);

/**
 * The results screen's race half (ticket 0052): finish order, headline, NEXT, and
 * GameState.lastResult (the run's story, used by the share card). Lives in this lazy chunk so
 * the main bundle stays small; main.js passes in what it owns.
 */
export function renderResults({ badgeText, lvl, next, racers, speedToWorld, playerZ, me, myLook, color, unlockedLevel, fieldSize }) {
  stage.hide();
  GameState.racePhase = 'RACING';
  const infinite = GameState.mode === 'INFINITE' || !GameState.raceLength;
  const outcome = /WRECKED/.test(badgeText || '') ? 'wrecked' : GameState.finishTime != null ? 'finished' : 'timeup';
  const field = racers.map((r) => ({
    id: r.id, driver: r.driver, short: r.short, car: r.car, color: r.color, mph: r.pace, look: lookOf(r),
    progress: GameState.distance + (r.worldZ - playerZ) / speedToWorld, finishTime: r.finishTime,
  }));
  field.push({ id: 'YOU', isPlayer: true, driver: 'YOU', short: 'YOU', car: me.car, color, look: myLook || lookOf(me),
    mph: Math.max(30, GameState.speed), progress: GameState.distance, finishTime: GameState.finishTime });
  const rows = infinite ? [] : finishResults(field, { elapsed: GameState.raceTime, length: GameState.raceLength, playerOutcome: outcome });
  const mine = rows.find((r) => r.isPlayer);
  const place = mine ? mine.place : GameState.racePosition;
  if (mine) GameState.racePosition = place;
  const aheadRow = rows[place - 2];
  const aheadField = aheadRow && field.find((f) => f.id === aheadRow.id);
  const beatBy = aheadRow && aheadRow.finished && GameState.finishTime != null ? Math.max(0, GameState.finishTime - (aheadField.finishTime || 0)) : null;
  const er = infinite ? GameState.endlessResult : null;
  const head = er
    ? { title: er.isBest ? '🏆 NEW BEST RUN!' : `♾️ TIER ${er.tier} REACHED`,
      line: `${er.distance.toLocaleString()} m · TIER ${er.tier} · BEST ${er.best.toLocaleString()} m${er.isBest ? '' : ` (${Math.max(0, er.best - er.distance).toLocaleString()} m to go)`}` }
    : infinite ? { title: 'STREET RUN SUMMARY', line: '' } : resultHeadline(place, rows.length, { startPos: fieldSize, beatBy, outcome });
  $('endModalTitle').textContent = head.title;
  const headLine = $('endHeadline');
  headLine.textContent = head.line;
  headLine.classList.toggle('hidden', !head.line);
  headLine.classList.toggle('is-win', Boolean(er && er.isBest));
  $('endPodiumBox').classList.toggle('hidden', infinite);
  stage.podium(rows);
  $('gameOverModal').dataset.place = infinite ? '' : String(place);
  // Next: the following level when it's open (daily runs have no "next").
  const nextOpen = !GameState.daily && next && next.index < unlockedLevel;
  const nextBtn = $('btnNextRace');
  nextBtn.classList.toggle('hidden', !nextOpen);
  nextBtn.dataset.level = nextOpen ? String(next.index) : '';
  GameState.lastResult = {
    place, total: rows.length, outcome, rows, levelIndex: lvl.index, levelName: lvl.name, look: myLook || lookOf(me),
    time: GameState.finishTime != null ? GameState.finishTime : GameState.raceTime,
    beat: rows.filter((r) => r.place > place).map((r) => r.name), daily: Boolean(GameState.daily), headline: head, beatBy, endless: er,
  };
}

/** Shows and sounds the start timeline's events; `hooks` { field(), announceLevel(), go() }. */
export function playStartEvents(events, hooks) {
  for (const ev of events) {
    if (ev.type === 'card') {
      const field = hooks.field();
      const r = field[ev.index];
      const call = lineupCall(r, ev.index, field.length);
      stage.card(r, call, ev.index, field.length);
      cardSting(ev.index);
      say(call.say);
    } else if (ev.type === 'grid') {
      stage.grid(hooks.field());
    } else if (ev.type === 'light') {
      stage.lights(ev.n);
      lightBeep();
      if (ev.n === 3) hooks.announceLevel();
    } else if (ev.type === 'go') {
      stage.lights('go');
      goBeep();
      say('Go!');
      hooks.go();
    } else if (ev.type === 'done') {
      stage.hide();
    }
  }
}
