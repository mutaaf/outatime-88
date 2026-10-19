// Home screen hooks (ticket 0185): why play right now, in 3 seconds. Pure: the save, the
// clock and a few facts in, ranked cards out. Every hook is true and personal — your best,
// today's daily, the next car, a rival, something new — never fake urgency or a fake count.
// src/home.js draws them; this file never touches the DOM.
import { CAR_SPECS, unlockProgress } from './cars.js';
import { tierStart } from './endless.js';
import { dailySpec, utcDay } from './daily.js';
import { isNewPlayer } from './onboarding.js';
import { goalsFor, goalLabel, GOALS } from './runner-goals.js';

/** Results go home on their own after this long with nobody touching anything. */
export const HOME_IDLE_MS = 20000;
/** How many hooks the home screen shows (phones in landscape show the first one only). */
export const HOME_HOOKS = 4;

/**
 * What's new, newest first. Each shows until it has been on the home screen `NEWS_VIEWS`
 * times or tapped once. Add an entry when a feature ships; drop it a few weeks later.
 */
export const NEWS = [
  { id: 'powerups-2026-10', icon: '🧲', title: 'NEW: POWER-UPS', line: 'MAGNET · SHIELD · 2X COINS ON THE ENDLESS HIGHWAY', act: 'play' },
  { id: 'tv-2026-10', icon: '📺', title: 'PLAY ON A TV', line: 'YOUR PHONE IS THE STEERING WHEEL', act: 'tv', big: true },
  { id: 'volt-2026-10', icon: '🔋', title: 'NEW CAR', line: 'VOLT ROADSTER · ELECTRIC, 0-88 IN A BLINK', act: 'garage', car: 'VOLT_ROADSTER' },
];
export const NEWS_VIEWS = 3;

/** A first visit: no finished run yet. It gets the pitch instead of the hooks. */
export const isFirstVisit = (save) => isNewPlayer(save) && !(save.endless && save.endless.runs);

/** Milliseconds until the next UTC midnight (when the daily road changes). */
export function untilNextDay(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

/** "5H 12M" / "12M" / "<1M". */
export function fmtLeft(ms) {
  const mins = Math.floor(Math.max(0, ms) / 60000);
  if (mins < 1) return '<1M';
  const h = Math.floor(mins / 60);
  return h ? `${h}H ${mins % 60}M` : `${mins}M`;
}

const fmtM = (n) => `${Math.round(n).toLocaleString('en-US')} m`;

function dayBefore(day) {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - 864e5);
}

/** Your Endless best and the next tier to beat. */
export function bestHook(save) {
  const e = save.endless;
  if (!e || !e.bestDistance) {
    return { id: 'best', icon: '♾️', title: 'ENDLESS HIGHWAY', line: 'HOW FAR CAN YOU GO?', act: 'play', score: 60 };
  }
  const tier = Math.max(1, e.bestTier | 0);
  const from = tierStart(tier), to = tierStart(tier + 1);
  return {
    id: 'best', icon: '♾️', title: `YOUR BEST ${fmtM(e.bestDistance)}`,
    line: `TIER ${tier} · BEAT IT: TIER ${tier + 1} STARTS AT ${fmtM(to)}`,
    progress: Math.max(0, Math.min(1, (e.bestDistance - from) / (to - from))), act: 'play', score: 70,
  };
}

/** Today's daily: the twist, your streak, and the real time until the road changes. */
export function dailyHook(save, now) {
  const day = utcDay(now);
  const spec = dailySpec(day);
  const c = save.career || {};
  const left = fmtLeft(untilNextDay(now));
  const done = c.lastDailyDay === day;
  const streak = c.dailyStreak | 0;
  const alive = streak > 0 && (done || c.lastDailyDay === dayBefore(day));
  if (done) {
    return { id: 'daily', icon: '📅', title: `DAILY ✓${streak > 1 ? ` · 🔥 ${streak} DAYS` : ''}`, line: `NEW ROAD IN ${left}`, act: 'daily', score: 20 };
  }
  return {
    id: 'daily', icon: '📅', title: `DAILY · ${spec.modifier.name}`,
    line: alive ? `KEEP YOUR 🔥 ${streak}-DAY STREAK · ${left} LEFT` : `SAME ROAD FOR EVERYONE · ${left} LEFT`,
    act: 'daily', score: alive ? 90 : 75,
  };
}

/** The car you're closest to: a coin car you can afford wins outright. */
export function carHook(save, names = {}) {
  const owned = (save.garage && save.garage.owned) || [];
  let best = null;
  for (const id of Object.keys(CAR_SPECS)) {
    if (owned.includes(id)) continue;
    const p = unlockProgress(save, id);
    const frac = p.need ? p.have / p.need : 0;
    const cost = CAR_SPECS[id].unlock.cost || Infinity;
    const buy = p.buyable ? 1 : 0;
    if (!best || buy > best.buy || (buy === best.buy && (frac > best.frac || (frac === best.frac && cost < best.cost)))) {
      best = { id, p, frac, cost, buy };
    }
  }
  if (!best) return null;
  const name = (names[best.id] || best.id.replace(/_/g, ' ')).toUpperCase();
  const coins = CAR_SPECS[best.id].unlock.type === 'coins';
  return {
    id: 'car', icon: '🏎️', title: best.p.buyable ? 'NEW CAR · BUY IT NOW!' : 'NEXT CAR',
    line: best.p.buyable ? `${name} · ⚡ ${best.cost.toLocaleString('en-US')}`
      : coins ? `${name} · ⚡ ${(save.fluxCoins | 0).toLocaleString('en-US')} / ${best.cost.toLocaleString('en-US')}` : `${name} · ${best.p.text}`,
    progress: best.frac, act: 'garage', car: best.id, score: best.p.buyable ? 100 : best.frac >= 0.5 ? 65 : 40,
  };
}

/** Endless goals: three per level; all three = a permanent points multiplier. Read-only. */
export function goalHook(save) {
  const g = save.endless && save.endless.goals;
  const ok = g && Number.isInteger(g.level) && Array.isArray(g.active) && g.active.length === 3
    && g.active.every((a) => GOALS.some((d) => d.type === a.type) && Number.isFinite(a.target));
  const level = ok ? g.level : 0;
  const active = ok ? g.active : goalsFor(0);
  const done = active.filter((a) => a.done).length;
  const next = active.find((a) => !a.done);
  if (!next) return null;
  return {
    id: 'goals', icon: '🎯', title: `LV ${level + 1} GOALS · ${done}/3`, line: `${goalLabel(next)}${done === 2 ? ' → LEVEL UP' : ''}`,
    progress: done / 3, act: 'play', score: done === 2 ? 78 : 50,
  };
}

/**
 * Ranked hooks for the home screen. ctx: { now, names (car id → name), rival (the title's
 * rival line, '' when none), bigScreen (a mouse-and-keyboard screen that could be a TV) }.
 */
export function homeHooks(save, ctx = {}) {
  const now = ctx.now || Date.now();
  const out = [bestHook(save), dailyHook(save, now)];
  const car = carHook(save, ctx.names);
  if (car) out.push(car);
  const goals = goalHook(save);
  if (goals) out.push(goals);
  if (ctx.rival) {
    const [icon, ...rest] = ctx.rival.split(' ');
    out.push({ id: 'rival', icon, title: 'WEEKLY RIVAL', line: rest.join(' '), act: 'ranks', score: 80 });
  }
  const seen = save.homeSeen || {};
  const news = NEWS.find((n) => (seen[n.id] | 0) < NEWS_VIEWS && (!n.big || ctx.bigScreen) && !(n.car && (save.garage?.owned || []).includes(n.car)));
  if (news) out.push({ ...news, isNew: true, score: 85 });
  else if (ctx.bigScreen) out.push({ id: 'tv', icon: '📺', title: 'PLAY ON A TV', line: 'YOUR PHONE IS THE STEERING WHEEL', act: 'tv', score: 30 });
  return out.sort((a, b) => b.score - a.score).slice(0, HOME_HOOKS);
}

/** Count one home-screen showing of a news hook (or `tapped` to retire it now). */
export function noteNewsSeen(save, id, tapped = false) {
  const seen = save.homeSeen && typeof save.homeSeen === 'object' ? save.homeSeen : (save.homeSeen = {});
  seen[id] = tapped ? NEWS_VIEWS : (seen[id] | 0) + 1;
}

/** The first-visit pitch: three beats, then PLAY. */
export const PITCH = ['RACE THROUGH TIME.', 'DODGE · DRIFT · JUMP.', 'LEVEL UP FOREVER.'];
