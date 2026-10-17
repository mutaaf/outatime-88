// Challenge links (ticket 0053): a shared result deep-links to the same track with the time
// to beat, e.g. /outatime/?track=2&beat=62.3&by=ACE (or track=daily-2026-10-17). Pure parsing
// and building so it's unit-tested; the title banner and share card use it.
// (`room=` belongs to live rooms; these names never overlap it.)
import { formatRaceTime } from './raceflow.js';

export const CHALLENGE_PARAMS = Object.freeze(['track', 'beat', 'by']);
const MAX_TIME = 3600;

/** { levelIndex | null, daily: 'YYYY-MM-DD' | null, beat: seconds, by: 'ABC' | '' } or null. */
export function parseChallenge(search, levels) {
  let p;
  try { p = new URLSearchParams(search); } catch (e) { return null; }
  const track = (p.get('track') || '').trim().toLowerCase();
  const beat = Number(p.get('beat'));
  if (!track || !Number.isFinite(beat) || beat <= 0 || beat > MAX_TIME) return null;
  const by = (p.get('by') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(track);
  if (daily) return { levelIndex: null, daily: daily[1], beat: Math.round(beat * 10) / 10, by };
  const n = Number(track);
  if (!Number.isInteger(n) || n < 1 || n > levels) return null;
  return { levelIndex: n - 1, daily: null, beat: Math.round(beat * 10) / 10, by };
}

/** The link that challenges a friend to your result. `base` = origin + BASE_URL. */
export function challengeUrl(base, { levelIndex, daily, time, initials }) {
  const u = new URL(base);
  u.searchParams.set('track', daily ? `daily-${daily}` : String((levelIndex | 0) + 1));
  u.searchParams.set('beat', (Math.round(time * 10) / 10).toFixed(1));
  const by = (initials || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (by) u.searchParams.set('by', by);
  return u.toString();
}

/** "ACE challenges you: beat 1:02.3" */
export function challengeBannerText(c) {
  return `${c.by || 'A FRIEND'} CHALLENGES YOU: BEAT ${formatRaceTime(c.beat)}`;
}

/** After a challenge race: did you beat it, and by how much. */
export function challengeVerdict(c, finishTime) {
  if (!c || finishTime == null) return null;
  const d = Math.round((c.beat - finishTime) * 10) / 10;
  const who = c.by || 'YOUR FRIEND';
  return d > 0
    ? { won: true, text: `⚔️ YOU BEAT ${who}'S ${formatRaceTime(c.beat)} BY ${d.toFixed(1)}s!` }
    : { won: false, text: `⚔️ ${who}'S ${formatRaceTime(c.beat)} STILL STANDS — ${Math.max(0.1, -d).toFixed(1)}s TO FIND` };
}

/** Names joined for a sentence: "DEZ", "DEZ and KAI", "DEZ, KAI and 3 more". */
export function namesSentence(names, max = 2) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
}

/**
 * The card's headline and the brag line, varied by how the race went.
 * r: { place, total, startPos, beatBy, outcome, beat: [names], time }
 */
export function shareCopy(r) {
  const beaten = namesSentence((r.beat || []).map((n) => n.split(/[ &]/)[0].toUpperCase()));
  const t = formatRaceTime(r.time);
  let kicker;
  if (r.outcome === 'wrecked') kicker = 'TOTALLED IT';
  else if (r.place === 1) kicker = r.startPos >= r.total ? 'BACK OF THE GRID TO THE WIN' : 'UNTOUCHABLE';
  else if (r.startPos - r.place >= 3) kicker = 'COMEBACK KID';
  else if (r.place <= 3) kicker = 'PODIUM FINISH';
  else if (r.beatBy != null && r.beatBy < 1) kicker = 'SO. CLOSE.';
  else if (r.place === r.total) kicker = 'DEAD LAST, FULL SEND';
  else kicker = 'STREET RACER';
  let brag;
  if (r.place === 1) brag = `I won in ${t}${beaten ? ` and left ${beaten} in the dust` : ''}. Can you beat me?`;
  else if (beaten) brag = `I outran ${beaten} in ${t}. Can you beat me?`;
  else if (r.place === r.total) brag = `Dead last in ${t}, but the vibes were immaculate. Bet you can't do worse.`;
  else brag = `${t} on the clock. Can you beat me?`;
  return { kicker, brag };
}
