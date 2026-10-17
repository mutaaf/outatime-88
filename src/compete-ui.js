// Competition UI (ticket 0091): the rank card after every run (movement, personal best, the
// exact target above you), the rival line on the title, and the animated board with a
// podium, medals, last week's champion and your own row always in view. Pure text helpers
// are exported for unit tests; renderers only touch the element they're given.

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** "▲ 12" / "▼ 2" / "NEW" / "—" for a rank going from prev to now (lower is better). */
export function rankMove(prev, now) {
  if (prev === null || prev === undefined) return { text: 'NEW', dir: 'new' };
  if (now < prev) return { text: `▲ ${prev - now}`, dir: 'up' };
  if (now > prev) return { text: `▼ ${now - prev}`, dir: 'down' };
  return { text: '—', dir: 'same' };
}

const BOARD_NAME = { week: 'THIS WEEK', all: 'ALL-TIME', daily: 'TODAY', track: 'ON THIS TRACK' };

/** The one thing to chase next, e.g. "12,400 BEHIND BIF FOR #7 THIS WEEK". */
export function targetLine(boards) {
  if (!boards) return '';
  for (const key of ['week', 'all']) {
    const b = boards[key];
    if (b?.ahead) return `🎯 ${fmt(b.ahead.gap)} BEHIND ${b.ahead.initials} FOR #${b.ahead.rank} ${BOARD_NAME[key]}`;
  }
  if (boards.all?.rank === 1) return '👑 #1 ALL-TIME — EVERYONE IS CHASING YOU';
  if (boards.week?.rank === 1) return '👑 #1 THIS WEEK — HOLD IT TILL SUNDAY';
  return '';
}

/** Title line from /standing: who passed you since last time, else your rival. */
export function rivalLine(s) {
  if (!s?.boards) return '';
  const all = s.boards.all;
  if (s.overtaken?.length && all) {
    const [first, ...rest] = s.overtaken;
    const who = rest.length ? `${first.initials} +${rest.length}` : first.initials;
    return `🚨 ${who} PASSED YOU — YOU'RE #${all.rank} NOW. TAKE IT BACK!`;
  }
  const week = s.boards.week;
  if (week?.ahead) return `⚔️ RIVAL ${week.ahead.initials} IS ${fmt(week.ahead.gap)} AHEAD THIS WEEK`;
  if (all?.ahead) return `⚔️ RIVAL ${all.ahead.initials} IS ${fmt(all.ahead.gap)} AHEAD FOR #${all.ahead.rank}`;
  if (week?.rank === 1 || all?.rank === 1) return `👑 YOU'RE #1 ${week?.rank === 1 ? 'THIS WEEK' : 'ALL-TIME'} — DEFEND IT`;
  return '';
}

/** "3D 4H" / "5H 12M" / "12M" until a season ends. */
export function timeLeft(endsAt, now) {
  const m = Math.max(0, Math.floor((endsAt - now) / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  if (d) return `${d}D ${h}H`;
  if (h) return `${h}H ${m % 60}M`;
  return `${m % 60}M`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Counts a number from `from` to `to` in the element (instant under reduced motion). */
function countTo(node, from, to, reduced, prefix = '#') {
  if (reduced || from === to || from === null) { node.textContent = `${prefix}${to}`; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    const e = 1 - (1 - k) ** 3;
    node.textContent = `${prefix}${Math.round(from + (to - from) * e)}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The results-screen rank card from a /scores POST response. Headline is this week's season
 * (climbable), chips show all-time / today / track, and the target line says exactly who to
 * beat next.
 */
export function renderRankCard(host, res, { reduced = false } = {}) {
  host.textContent = '';
  const boards = res?.boards;
  if (!boards) return false;
  const head = boards.week || boards.all;
  const card = el('div', `rank-card${reduced ? '' : ' rank-card-in'}`);
  const main = el('div', 'rank-main');
  const label = el('span', 'rank-label', boards.week ? 'THIS WEEK' : 'ALL-TIME');
  const num = el('span', 'rank-num', `#${head.rank}`);
  num.dataset.rank = String(head.rank);
  const mv = rankMove(head.prevRank, head.rank);
  const move = el('span', `rank-move rank-${mv.dir}`, mv.text);
  main.append(label, num, move);
  const all = boards.all;
  if (all?.pb && all.prevBest !== null && all.prevBest !== undefined) main.append(el('span', 'rank-pb', '★ NEW BEST'));
  card.append(main);
  const target = targetLine(boards);
  if (target) card.append(el('div', 'rank-target', target));
  const chips = el('div', 'rank-chips');
  for (const key of ['all', 'daily', 'track']) {
    const b = boards[key];
    if (!b) continue;
    const m = rankMove(b.prevRank, b.rank);
    chips.append(el('span', `rank-chip rank-${m.dir}`, `${key === 'all' ? 'ALL' : key === 'daily' ? 'TODAY' : 'TRACK'} #${b.rank}${m.dir === 'up' ? ` ${m.text}` : ''}`));
  }
  if (res.streak?.days) chips.append(el('span', 'rank-chip rank-streak', `🔥 ${res.streak.days}-DAY STREAK`));
  card.append(chips);
  host.append(card);
  countTo(num, head.prevRank ?? null, head.rank, reduced);
  return true;
}

/**
 * Board rows with a top-3 podium, medal/crown badges and your row highlighted; your own row
 * is appended (after a gap) when you're outside the top N, and scrolled into view.
 * opts: { me: initials, champion: initials|null, medal: (entry) => '🥇'|'', reduced }
 */
export function renderBoardRows(list, data, { me = '', champion = null, medal = () => '', reduced = false } = {}) {
  list.textContent = '';
  const rows = [...data.entries];
  const mine = data.me && !rows.some((e) => e.initials === data.me.initials) ? data.me : null;
  const add = (e, i, extra = '') => {
    const li = el('li', `board-row${e.initials === me ? ' me' : ''}${e.rank <= 3 ? ` p${e.rank}` : ''}${extra}${reduced ? '' : ' board-row-in'}`);
    li.style.setProperty('--i', String(i));
    const rk = el('span', 'rk', e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`);
    const ini = el('span', 'in', e.initials);
    const badges = `${champion && e.initials === champion ? '👑' : ''}${medal(e) || ''}`;
    if (badges) ini.append(el('i', 'badges', ` ${badges}`));
    li.append(rk, ini, el('span', 'sc', fmt(e.score)));
    list.append(li);
    return li;
  };
  rows.forEach((e, i) => add(e, i));
  if (mine) {
    list.append(el('li', 'board-gap', '⋯'));
    add(mine, rows.length + 1, ' me-pinned');
  }
  const mineRow = list.querySelector('.board-row.me');
  if (mineRow && mineRow.scrollIntoView) mineRow.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
