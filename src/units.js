// Speed units (ticket 0293): Settings → Units MPH | KM/H. Display only: the sim, the 88 mph warp,
// the leaderboard and share text all stay in mph. Saved as SaveStore.data.settings.units
// ('mph' | 'kmh'); with no choice saved the device language picks (en-US, en-GB … stay mph), read
// on the device, no network. Its own lazy chunk, fetched by race-late (unitsFrame once a frame) and
// the settings panel: main's HUD, the warp banner and the results card only read GameState.kmh.
import { GameState } from './state.js';
import { SaveStore } from './save.js';

export const KMH_PER_MPH = 1.609344;

/** Whole km/h for a speed in mph (never negative). */
export const toKmh = (mph) => Math.round(Math.max(0, Number(mph) || 0) * KMH_PER_MPH);

// Regions that sign road speed in mph; a bare "en" counts as the US (the game's own default).
const MPH_REGIONS = /^(US|GB|LR|MM|PR|BS|BZ|KY|VG|VI|GU|AS|MP|AG|DM|GD|KN|LC|VC|FK)$/i;

/** 'mph' | 'kmh' for a saved choice, else for a BCP 47 language tag ('en-US', 'fr-FR', 'de'). */
export function unitsFor(saved, lang) {
  if (saved === 'mph' || saved === 'kmh') return saved;
  const tag = String(lang || '').split(/[-_]/);
  if (!tag[0] || (/^en$/i.test(tag[0]) && !tag[1])) return 'mph';
  const region = tag.slice(1).find((p) => /^[a-z]{2}$/i.test(p));
  return region && MPH_REGIONS.test(region) ? 'mph' : 'kmh';
}

/** "142 KM/H" or "88 MPH" for a speed in mph. */
export const formatSpeed = (mph, kmh) => (kmh ? `${toKmh(mph)} KM/H` : `${Math.round(Math.max(0, Number(mph) || 0))} MPH`);

const lang = () => (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages || [])[0])) || '';

// The language never changes in a visit: the rule runs once per saved value, not every frame.
let memoSaved = {}, memoUnits = 'mph';
/** The units in force now (the saved choice, else this device's language). */
export function currentUnits() {
  const saved = SaveStore.data.settings && SaveStore.data.settings.units;
  if (saved !== memoSaved) { memoSaved = saved; memoUnits = unitsFor(saved, lang()); }
  return memoUnits;
}

let cap = null, meter = null, num = null, lastKmh = null, lastSpoken = -1;
/** Once per frame (race-late), paused too: GameState.kmh, the HUD's unit caption and number on a flip
 *  (the HUD itself only repaints while the race steps), and the speed meter's spoken value. Change-only. */
export function unitsFrame(doc = document) {
  const kmh = currentUnits() === 'kmh';
  GameState.kmh = kmh;
  if (kmh !== lastKmh) {
    cap = cap || doc.querySelector('#hudSpeedCard .spd-line small');
    num = num || doc.getElementById('hudSpeed');
    if (cap) {
      cap.textContent = kmh ? 'KM/H' : 'MPH';
      if (num && lastKmh !== null) num.textContent = String(kmh ? toKmh(GameState.speed) : Math.max(0, Math.round(GameState.speed)));
      lastKmh = kmh;
    }
  }
  // aria-valuenow stays mph out of 160 (the bar, 0284); in km/h the meter speaks "142 km/h".
  const spoken = kmh ? toKmh(GameState.speed) : -1;
  if (spoken !== lastSpoken) {
    meter = meter || doc.querySelector('#hudSpeedCard .speed-meter');
    if (meter) {
      if (kmh) meter.setAttribute('aria-valuetext', `${spoken} km/h`); else meter.removeAttribute('aria-valuetext');
      lastSpoken = spoken;
    }
  }
}
