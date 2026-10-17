// Race ceremony (ticket 0052): the grid lineup where every racer is called out, the
// 3-2-1-GO lights with a rocket-start window, live position and lap callouts, and the
// finish-order results. Pure timelines and text, unit-tested; src/racestage.js draws them.
import { ordinal, formatRaceTime, projectedFinish } from './raceflow.js';

export const START = Object.freeze({
  card: 0.95,       // seconds each racer's card is on screen during the lineup
  hold: 0.6,        // the whole grid together before the lights
  light: 0.9,       // seconds per red light (3, 2, 1)
  goHold: 0.8,      // GO! stays up this long after green
});

/** Launch timing relative to green: tap boost just before or at GO for a rocket start. */
export const LAUNCH = Object.freeze({ early: -0.35, perfectEnd: 0.12, goodEnd: 0.45 });

/** 'perfect' | 'good' | 'early' | null (too late, or no press) for a press `t` seconds from GO. */
export function judgeLaunch(t) {
  if (t == null || !Number.isFinite(t)) return null;
  if (t < LAUNCH.early) return 'early';
  if (t <= LAUNCH.perfectEnd) return 'perfect';
  if (t <= LAUNCH.goodEnd) return 'good';
  return null;
}

/** What a launch does: extra mph at GO, flux, and (for jumping the start) a stall. */
export const LAUNCH_EFFECT = Object.freeze({
  perfect: { mph: 70, flux: 25, stall: 0, text: '🚀 ROCKET START!' },
  good: { mph: 38, flux: 10, stall: 0, text: '💨 GOOD START!' },
  early: { mph: 0, flux: 0, stall: 0.9, text: '😵 JUMPED THE START!' },
});

/**
 * The start timeline. With `lineup`, each racer gets a card first; otherwise straight to the
 * lights. update(dt) returns the events that happened during dt, in order:
 *   { type: 'card', index }  { type: 'grid' }  { type: 'light', n: 3|2|1 }  { type: 'go' }  { type: 'done' }
 * skip() jumps from the lineup to the lights (a tap). `t` is time relative to GO (negative before).
 */
export function createStartSequence({ racers, lineup = true }) {
  const lineupEnd = lineup ? racers * START.card + START.hold : 0;
  const goAt = lineupEnd + 3 * START.light;
  const end = goAt + START.goHold;
  let clock = 0;
  let skipped = false;
  const fired = new Set();
  const events = [];
  let schedule = null;

  function plan() {
    const list = [];
    if (lineup && !skipped) {
      for (let i = 0; i < racers; i++) list.push({ at: i * START.card, ev: { type: 'card', index: i } });
      list.push({ at: racers * START.card, ev: { type: 'grid' } });
    }
    for (let n = 3; n >= 1; n--) list.push({ at: lineupEnd + (3 - n) * START.light, ev: { type: 'light', n } });
    list.push({ at: goAt, ev: { type: 'go' } });
    list.push({ at: end, ev: { type: 'done' } });
    return list;
  }

  return {
    get t() { return clock - goAt; },
    get inLineup() { return lineup && !skipped && clock < lineupEnd; },
    get done() { return clock >= end; },
    get started() { return clock >= goAt; },
    update(dt) {
      events.length = 0;
      clock += dt;
      if (!schedule) schedule = plan();
      for (const p of schedule) {
        const key = `${p.ev.type}${p.ev.index ?? ''}${p.ev.n ?? ''}`;
        if (clock >= p.at && !fired.has(key)) { fired.add(key); events.push(p.ev); }
      }
      return events;
    },
    /** Tap during the lineup: go straight to the lights. */
    skip() {
      if (!this.inLineup) return false;
      skipped = true;
      clock = lineupEnd;
      schedule = plan();
      return true;
    },
  };
}

const SLOT_CALL = ['ON POLE', 'ALONGSIDE', 'ROW TWO', 'ROW TWO', 'ROW THREE', 'ROW THREE', 'ROW FOUR', 'ROW FOUR'];

/** Announcer line for a grid card. Racers are front (pole) to back; you are flagged isPlayer. */
export function lineupCall(racer, slot, total) {
  if (racer.isPlayer) return { tag: slot === total - 1 ? 'AND AT THE BACK…' : `STARTING ${ordinal(slot + 1)}…`, name: 'YOU!', say: 'And starting at the back… you!' };
  const tag = SLOT_CALL[slot] || `STARTING ${ordinal(slot + 1)}`;
  return { tag, name: racer.driver.toUpperCase(), say: racer.driver.replace(/&/g, 'and') };
}

/**
 * Live callouts: a position change is announced once it has held for `settle` seconds (no
 * flicker in a pack), at most every `gap` seconds; lap changes always announce.
 */
export function createCallouts({ settle = 0.6, gap = 2.2, laps = 3 } = {}) {
  let shownPos = null, pendingPos = null, pendingFor = 0, since = Infinity, lastLap = 1;
  return {
    reset(pos) { shownPos = pos; pendingPos = null; pendingFor = 0; since = Infinity; lastLap = 1; },
    /** @returns null or { main, sub, kind: 'lap'|'final'|'up'|'down' } */
    update(dt, pos, lap) {
      since += dt;
      if (lap !== lastLap) {
        lastLap = lap;
        since = 0;
        return lap === laps
          ? { main: '🏁 FINAL LAP! 🏁', sub: `YOU'RE ${ordinal(pos)} — GIVE IT EVERYTHING`, kind: 'final' }
          : { main: `LAP ${lap}/${laps}`, sub: `YOU'RE ${ordinal(pos)}`, kind: 'lap' };
      }
      if (pos === shownPos) { pendingPos = null; pendingFor = 0; return null; }
      if (pos !== pendingPos) { pendingPos = pos; pendingFor = 0; return null; }
      pendingFor += dt;
      if (pendingFor < settle || since < gap) return null;
      const up = shownPos == null || pos < shownPos;
      shownPos = pos;
      pendingPos = null;
      since = 0;
      if (pos === 1) return { main: "⭐ YOU'RE 1ST! ⭐", sub: 'HOLD THE LEAD', kind: 'up' };
      return up
        ? { main: `⬆ YOU'RE ${ordinal(pos)}!`, sub: 'KEEP PUSHING', kind: 'up' }
        : { main: `⬇ DOWN TO ${ordinal(pos)}`, sub: 'GET IT BACK — DRAFT & BOOST', kind: 'down' };
    },
  };
}

/**
 * Final order with a time for every racer. Finished racers show their time; the rest are
 * projected at their current pace and marked estimated. Your row keeps "TIME UP"/"WRECKED"
 * if you didn't reach the line.
 * @param field [{ id, driver, car, color, progress, finishTime, mph, isPlayer }]
 */
export function finishResults(field, { elapsed, length, playerOutcome = 'finished' }) {
  const rows = field.map((e) => {
    const finished = e.finishTime != null;
    const time = finished ? e.finishTime : projectedFinish(elapsed, e.progress, length, e.mph || 60);
    return { ...e, finished, time };
  });
  // Same order as the live standings: finishers by time, then everyone else by distance.
  rows.sort((a, b) => (a.finished && b.finished ? a.time - b.time : a.finished !== b.finished ? (a.finished ? -1 : 1) : b.progress - a.progress));
  return rows.map((r, i) => ({
    place: i + 1,
    id: r.id,
    name: r.isPlayer ? 'YOU' : r.driver,
    car: r.car,
    color: r.color,
    isPlayer: Boolean(r.isPlayer),
    finished: r.finished,
    timeText: r.isPlayer && !r.finished && playerOutcome !== 'finished'
      ? (playerOutcome === 'wrecked' ? 'WRECKED' : 'TIME UP')
      : `${formatRaceTime(r.time)}${r.finished ? '' : '*'}`,
  }));
}

/**
 * Results headline by how it went. `startPos` is where you started, `beatBy` the gap to the
 * car ahead (s) when you didn't win.
 */
export function resultHeadline(place, total, { startPos = total, beatBy = null, outcome = 'finished' } = {}) {
  if (outcome === 'wrecked') return { title: 'WRECKED!', line: 'Tow truck’s on the way. Run it back?' };
  if (place === 1) return startPos >= total - 1
    ? { title: 'YOU WIN!', line: `From the back of the grid to the top step!` }
    : { title: 'YOU WIN!', line: 'Nobody could touch you.' };
  if (place <= 3) return startPos - place >= 3
    ? { title: `${ordinal(place)} PLACE!`, line: `What a comeback — up ${startPos - place} places!` }
    : { title: `${ordinal(place)} PLACE!`, line: beatBy != null && beatBy < 1 ? `Podium! ${beatBy.toFixed(1)}s from the win.` : 'On the podium!' };
  if (beatBy != null && beatBy < 1.5) return { title: `${ordinal(place)} PLACE`, line: `So close — ${beatBy.toFixed(1)}s off ${ordinal(place - 1)}!` };
  if (place === total) return { title: `${ordinal(place)} PLACE`, line: 'Somebody has to make the others look good. Again?' };
  return { title: `${ordinal(place)} PLACE`, line: 'Draft, drift and boost to climb the grid.' };
}
