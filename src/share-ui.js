// Share button, share sheet and the challenge banner (ticket 0053). The card renderer and
// the QR encoder live in a lazy chunk (src/share.js) fetched when results open.
import { SaveStore } from './save.js';
import { GameState } from './state.js';
import { POP_CULTURE_ROSTER, WORLD_LEVELS } from './data.js';
import { ordinal, formatRaceTime } from './raceflow.js';
import { parseChallenge, challengeUrl, challengeBannerText, shareCopy, challengeVerdict } from './sharelink.js';

const $ = (id) => document.getElementById(id);
let mod = null;
const loadShare = () => (mod = mod || import('./share.js'));
let format = 'post';
let current = null;          // the card data for the results on screen
let rendered = { post: null, wide: null }; // { blob, url } per format, for this result
let challenge = null;
let hooks = { startChallenge() {} };

const BASE = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Everything the card needs, from the race that just ended. */
function cardData() {
  const r = GameState.lastResult;
  if (!r || !r.rows || !r.rows.length) return null;
  const me = POP_CULTURE_ROSTER[GameState.selectedCharIdx] || POP_CULTURE_ROSTER[0];
  const initials = SaveStore.data.initials || '';
  const live = typeof GameState.liveInvite === 'string' && GameState.liveInvite ? GameState.liveInvite : null;
  const url = live || challengeUrl(BASE(), {
    levelIndex: r.levelIndex, daily: r.daily ? (GameState.daily && GameState.daily.day) : null, time: r.time, initials,
  });
  const laps = GameState.lapSplits || [];
  return {
    place: r.place, total: r.total, startPos: r.total, beatBy: r.beatBy ?? null, outcome: r.outcome,
    beat: r.beat, time: r.time, bestLap: laps.length > 1 ? Math.min(...laps) : null, levelName: r.levelName.replace(/^LVL \d+:\s*/i, ''),
    daily: r.daily, initials, car: me.car, color: SaveStore.data.underglow || me.glow, url, isRoom: Boolean(live),
    displayUrl: url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''),
  };
}

async function render(fmt) {
  if (rendered[fmt]) return rendered[fmt];
  const m = await loadShare();
  const canvas = document.createElement('canvas');
  await m.drawShareCard(canvas, current, fmt);
  const blob = await m.toBlob(canvas);
  rendered[fmt] = { blob, url: URL.createObjectURL(blob) };
  return rendered[fmt];
}

function filename() {
  const place = current.outcome === 'wrecked' ? 'wrecked' : ordinal(current.place).toLowerCase();
  return `outatime-${place}-${current.levelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
}
const shareText = () => `${shareCopy(current).brag} 🏁 OUTATIME 88`;

function status(msg) {
  const el = $('shareStatus');
  if (el) el.textContent = msg;
}

/** Called when the results screen shows: build the card and its live preview. */
export async function onResults(levelIndex) {
  // Did you beat the friend whose link brought you here, on their track?
  const ch = challenge;
  const sameTrack = ch && (ch.daily ? GameState.daily && GameState.daily.day === ch.daily : !GameState.daily && ch.levelIndex === levelIndex);
  const verdict = sameTrack ? challengeVerdict(ch, GameState.finishTime) : null;
  const head = $('endHeadline');
  if (verdict && head) {
    head.textContent = verdict.text;
    head.classList.remove('hidden');
    head.classList.toggle('is-win', verdict.won);
  }
  const btn = $('btnShare');
  if (!btn) return;
  for (const k of Object.keys(rendered)) if (rendered[k]) URL.revokeObjectURL(rendered[k].url);
  rendered = { post: null, wide: null };
  current = cardData();
  btn.classList.toggle('hidden', !current);
  if (!current) return;
  btn.querySelector('small').textContent = current.isRoom ? 'invite friends to the rematch' : `challenge a friend to beat ${formatRaceTime(current.time)}`;
  const img = $('sharePreview');
  img.removeAttribute('src');
  try {
    const r = await render('post');
    if (current) img.src = r.url;
  } catch (e) { /* the button still works; the sheet retries */ }
}

async function openSheet() {
  $('shareSheet').classList.remove('hidden');
  $('btnShareNative').classList.toggle('hidden', typeof navigator.share !== 'function');
  status('');
  await showFormat(format);
}

let showSeq = 0;
async function showFormat(fmt) {
  format = fmt;
  const seq = ++showSeq;
  for (const b of document.querySelectorAll('#shareSheet [data-format]')) b.setAttribute('aria-pressed', String(b.dataset.format === fmt));
  const r = await render(fmt);
  if (seq !== showSeq) return; // a newer pick finished rendering first; don't paint over it
  $('shareSheetImg').src = r.url;
  $('shareSheetImg').dataset.format = fmt;
}

async function nativeShare() {
  const r = await render(format);
  const res = await (await loadShare()).shareNative({ blob: r.blob, filename: filename(), title: 'OUTATIME 88', text: shareText(), url: current.url });
  return res;
}

/** Wires the results Share button, the sheet and the title challenge banner. */
let inited = false;
export function initShareUi({ startChallenge } = {}) {
  if (inited) return;
  inited = true;
  if (startChallenge) hooks.startChallenge = startChallenge;
  const btn = $('btnShare');
  if (btn) btn.addEventListener('click', async () => {
    if (!current) return;
    // Phones and tablets: straight into the system share sheet with the picture attached.
    if (typeof navigator.share === 'function') {
      const res = await nativeShare();
      if (res !== 'unsupported') return;
    }
    openSheet();
  });
  $('btnShareClose').addEventListener('click', () => $('shareSheet').classList.add('hidden'));
  $('shareSheet').addEventListener('click', (e) => { if (e.target.id === 'shareSheet') $('shareSheet').classList.add('hidden'); });
  for (const b of document.querySelectorAll('#shareSheet [data-format]')) b.addEventListener('click', () => showFormat(b.dataset.format));
  $('btnShareCopy').addEventListener('click', async () => {
    const res = await (await loadShare()).copyLink(`${shareText()} ${current.url}`);
    status(res === 'copied' ? '✓ LINK COPIED — PASTE IT TO A FRIEND' : 'Could not copy — long-press the picture to save it instead');
  });
  $('btnShareSave').addEventListener('click', async () => {
    const r = await render(format);
    (await loadShare()).downloadPng(r.blob, filename());
    status('✓ IMAGE SAVED');
  });
  $('btnShareNative').addEventListener('click', async () => {
    const res = await nativeShare();
    status(res === 'shared' ? '✓ SHARED' : res === 'cancelled' ? '' : 'Sharing is not available here — copy the link instead');
  });

  // A friend's challenge link: a banner on the title with one-tap RACE.
  challenge = parseChallenge(location.search, WORLD_LEVELS.length);
  const banner = $('challengeBanner');
  if (challenge && banner) {
    $('challengeText').textContent = challengeBannerText(challenge);
    const lvl = challenge.levelIndex != null ? WORLD_LEVELS[challenge.levelIndex] : null;
    $('challengeTrack').textContent = challenge.daily ? `DAILY · ${challenge.daily}` : (lvl ? lvl.name : '');
    banner.classList.remove('hidden');
    $('btnAcceptChallenge').addEventListener('click', (e) => { e.stopPropagation(); hooks.startChallenge(challenge); });
  }
}

/** The challenge this visit came with (null when none). */
export const activeChallenge = () => challenge;
