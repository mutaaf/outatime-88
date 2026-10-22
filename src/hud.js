// Race HUD (ticket 0051): big position, lap, race time and clock, gaps to the cars either
// side, a track strip with every racer's dot, speed with the 88 mark, flux and health.
//
// update() runs every frame but only touches the DOM when a value actually changes, and it
// never reads layout, so the HUD can't thrash. CSS owns sizes (it scales with the viewport).
import { lapOf, ordinal, formatRaceTime, formatGap, gapSeconds, RACE_LAPS } from './raceflow.js';

const SPEED_FULL = 160; // mph at a full speed bar; 88 sits at 55%

export function createHud(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    pos: $('hudPos'), posOf: $('hudPosOf'), posCard: $('hudPosCard'), lap: $('hudLap'), hp: $('hudHp'),
    hpBox: $('hudHpBox'), hpPop: $('hudHpPop'),
    time: $('hudTime'), clock: $('hudClock'), clockWrap: $('hudClockWrap'),
    ahead: $('hudGapAhead'), behind: $('hudGapBehind'), dots: $('hudDots'),
    speed: $('hudSpeed'), speedBar: $('hudSpeedBar'), speedCard: $('hudSpeedCard'),
    flux: $('hudFlux'), fluxLabel: $('hudFluxLabel'), score: $('hudScore'), nos: $('hudNos'),
  };
  const last = Object.create(null);
  const dots = new Map(); // racer id -> { node, left }
  // HP feedback (ticket 0150): a hit flashes the bar red and floats −N, a heal glows green and
  // floats +N. Animations restart by alternating two identical keyframe names (no reflow read).
  const hpFx = { hp: null, max: 0, n: 0 };
  function hpChanged(hp, max) {
    if (hp == null || !max) return;
    const prev = hpFx.hp;
    hpFx.hp = hp;
    if (prev == null || max !== hpFx.max) { hpFx.max = max; return; }
    const d = hp - prev;
    // Small per-frame regen ticks only move the bar; real hits and heals get the pop.
    if (d > -1 && d < 2) return;
    hpFx.n++;
    const kind = d < 0 ? 'hit' : 'heal';
    if (el.hpBox) el.hpBox.dataset.fx = `${kind}${hpFx.n % 2}`;
    if (el.hpPop) {
      el.hpPop.textContent = `${d < 0 ? '−' : '+'}${Math.round(Math.abs(d))} HP`;
      el.hpPop.dataset.fx = `${kind}${hpFx.n % 2}`;
    }
  }

  /** Sets a text/attr/style only when it differs from what this HUD last wrote. */
  function put(key, value, apply) {
    if (last[key] === value) return;
    last[key] = value;
    apply(value);
  }
  const text = (node, key, value) => node && put(key, value, (v) => { node.textContent = v; });
  const width = (node, key, pct) => node && put(key, Math.round(pct * 10) / 10, (v) => { node.style.width = `${v}%`; });
  const flag = (node, key, cls, on) => node && put(key, on, (v) => { node.classList.toggle(cls, v); });

  function syncDots(field) {
    if (!el.dots) return;
    let same = dots.size === field.length;
    for (let i = 0; same && i < field.length; i++) same = dots.has(field[i].id);
    if (!same) {
      el.dots.textContent = '';
      dots.clear();
      for (const e of field) {
        const node = doc.createElement('span');
        node.className = e.isPlayer ? 'hud-dot hud-dot-you' : 'hud-dot';
        node.style.setProperty('--dot', e.isPlayer ? '#ffffff' : (e.color || '#94a3b8'));
        node.title = e.isPlayer ? 'You' : e.short;
        if (e.isPlayer) node.textContent = 'YOU';
        el.dots.appendChild(node);
        dots.set(e.id, { node, left: -1 });
      }
    }
  }

  return {
    /** Forget what was written (after a restart) so the next update repaints everything. */
    reset() { for (const k of Object.keys(last)) delete last[k]; hpFx.hp = null; },

    /**
     * @param s { position, total, progress, length, raceTime, timeLeft, clockUrgent, infinite,
     *            mph, flux, hpFrac, score, field: standings leader-first [{id, short, color,
     *            progress, isPlayer}] }
     */
    update(s) {
      const posText = ordinal(s.position);
      text(el.pos, 'pos', posText);
      text(el.posOf, 'posOf', `/${s.total}`);
      if (el.posCard) put('podium', s.position <= 3 ? `p${s.position}` : 'p', (v) => { el.posCard.dataset.place = v; });

      if (s.infinite) {
        text(el.lap, 'lap', `${s.tier ? `T${s.tier} · ` : ''}${Math.floor(s.progress).toLocaleString()} m`);
        flag(el.lap, 'finalLap', 'is-final', false);
      } else {
        const { lap } = lapOf(s.progress, s.length);
        text(el.lap, 'lap', lap === RACE_LAPS ? `FINAL LAP` : `LAP ${lap}/${RACE_LAPS}`);
        flag(el.lap, 'finalLap', 'is-final', lap === RACE_LAPS);
      }
      width(el.hp, 'hp', Math.max(0, Math.min(1, s.hpFrac)) * 100);
      flag(el.hp, 'hpLow', 'is-low', s.hpFrac <= 0.3);
      hpChanged(s.hp, s.maxHp);

      text(el.time, 'time', formatRaceTime(s.raceTime));
      flag(el.clockWrap, 'noClock', 'hidden', s.infinite);
      text(el.clock, 'clock', String(Math.ceil(Math.max(0, s.timeLeft))));
      flag(el.clockWrap, 'urgent', 'timer-urgent', !s.infinite && s.clockUrgent);

      // Gaps to the cars directly ahead and behind, in seconds at your speed.
      const field = s.field;
      const i = s.position - 1;
      const me = field[i];
      const a = field[i - 1];
      const b = field[i + 1];
      // Compact (phones in portrait, ticket 0190): no initials, so the seconds always fit;
      // the track strip's dots still say who is where.
      const who = (e) => `${e.nemesis ? '😈' : ''}${s.compact ? '' : `${e.short} `}`;
      text(el.ahead, 'ahead', a && me ? `▲ ${who(a)}+${formatGap(gapSeconds(a.progress - me.progress, s.mph))}` : (me ? (s.compact ? '★ LEAD' : '★ LEADING') : ''));
      text(el.behind, 'behind', b && me ? `▼ ${who(b)}−${formatGap(gapSeconds(me.progress - b.progress, s.mph))}` : '');

      // Track strip: one dot per racer at its share of the race (endless: relative to you).
      syncDots(field);
      for (const e of field) {
        const d = dots.get(e.id);
        if (!d) continue;
        const frac = s.infinite
          ? 0.5 + Math.max(-0.5, Math.min(0.5, (e.progress - s.progress) / 1200))
          : Math.max(0, Math.min(1, e.progress / s.length));
        const left = Math.round(frac * 1000) / 10;
        if (left !== d.left) { d.left = left; d.node.style.left = `${left}%`; }
      }

      const mph = Math.max(0, Math.round(s.mph));
      text(el.speed, 'speed', String(mph));
      width(el.speedBar, 'speedBar', Math.min(100, (mph / SPEED_FULL) * 100));
      flag(el.speedCard, 'at88', 'is-88', mph >= 88);
      width(el.flux, 'flux', Math.max(0, Math.min(100, s.flux)));
      if (el.nos) {
        width(el.nos, 'nos', Math.round(Math.max(0, Math.min(1, s.nos || 0)) * 100));
        flag(el.speedCard, 'nosOn', 'is-nos', Boolean(s.nosOn));
      }
      const ready = s.flux >= 92;
      text(el.fluxLabel, 'fluxLabel', ready ? '⚡ WARP READY' : 'FLUX');
      flag(el.speedCard, 'ready', 'is-ready', ready);
      // The score sits under the FLUX meter; labelled as points so it never reads as flux.
      // Ticket 0199: never below 0 (see scoreText); a negative total is tagged PENALTY instead.
      const pts = Math.round(s.score);
      text(el.score, 'score', scoreText(pts));
      flag(el.score, 'scorePen', 'is-pen', pts < 0);
    },
  };
}

/**
 * The live score pill (ticket 0199). Penalties are charged live, so the running total can dip
 * below zero, but the final score is max(0, earned − penalty) (src/scoring.js): show what the
 * run would pay now, rounded as the results card rounds it. The HUD tags a negative total
 * PENALTY (CSS) instead of printing a minus sign.
 */
export const scoreText = (score) => `${Math.max(0, Math.round(score) || 0).toLocaleString()} PTS`;

/** Screen rects of every HUD block (for no-overlap checks by other UI, e.g. touch controls). */
export function hudRects(doc = document) {
  const out = [];
  for (const node of doc.querySelectorAll('[data-hud-rect]')) {
    const r = node.getBoundingClientRect();
    if (r.width && r.height) out.push({ id: node.id, x: r.x, y: r.y, width: r.width, height: r.height });
  }
  return out;
}
