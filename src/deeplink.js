// Deep links (ticket 0110): launcher and share URLs that open a screen instead of the plain
// title, e.g. /outatime/?play=daily or ?board=week. Lazy-loaded only when such a param is
// present, so the boot bundle pays a one-line check. Live rooms (`room=`), challenges
// (`track/beat/by`) and the render mode (`view=`) keep their own parsers.
// Nothing here can bypass unlocks or start a race without a tap (audio/iOS gesture rules).

const BOARDS = {
  week: { board: 'week', mode: 'ARCADE' },
  today: { board: 'daily', mode: 'ARCADE' },
  all: { board: 'all', mode: 'ARCADE' },
  track: { board: 'all', mode: 'ARCADE', track: true },
  friends: { board: 'friends', mode: 'ARCADE' },
  daily: { board: 'daily', mode: 'DAILY' },
};
const PLAYS = ['friends', 'quick', 'daily'];
export const DEEP_PARAMS = Object.freeze(['play', 'board', 'level', 'garage']);
export const DEEP_RE = /[?&](play|board|level|garage)(=|&|$)/;

/** { play, board, level (0-based), garage } — each null/false when absent or invalid. */
export function parseDeepLink(search, levels) {
  let p;
  try { p = new URLSearchParams(search); } catch (e) { p = new URLSearchParams(); }
  const play = (p.get('play') || '').toLowerCase();
  const board = (p.get('board') || '').toLowerCase();
  const n = Number(p.get('level'));
  return {
    play: PLAYS.includes(play) ? play : null,
    board: Object.prototype.hasOwnProperty.call(BOARDS, board) ? { ...BOARDS[board] } : null,
    level: p.has('level') && Number.isInteger(n) && n >= 1 && n <= levels ? n - 1 : null,
    garage: p.has('garage'),
  };
}

/** The same search string without the one-shot deep-link params (a refresh stays on the title). */
export function stripDeepLink(search) {
  const p = new URLSearchParams(search);
  DEEP_PARAMS.forEach((k) => p.delete(k));
  const qs = p.toString().replace(/=(&|$)/g, '$1'); // keep bare flags like ?debug bare
  return qs ? `?${qs}` : '';
}

const hint = (text) => { const el = document.getElementById('playHint'); if (el) el.textContent = text; };

/** Apply a deep link once at boot. `h` = the game's hooks (see main.js). */
export function applyDeepLink(h) {
  const d = parseDeepLink(location.search, h.levels.length);
  try { history.replaceState(null, '', `${location.pathname}${stripDeepLink(location.search)}${location.hash}`); } catch (e) { /* sandboxed */ }
  if (d.level != null) {
    if (d.level < h.unlocked()) { h.pickLevel(d.level); hint(`TAP TO RACE ${h.levels[d.level].name}`); }
    else hint(`LEVEL ${d.level + 1} IS LOCKED — WIN TO UNLOCK · TAP TO RACE`);
  }
  if (d.play === 'daily') { h.titleStart({ daily: true }); hint("TAP TO RACE TODAY'S DAILY"); }
  if (d.play === 'friends' || d.play === 'quick') {
    return h.live().then((l) => {
      l.openMenu();
      if (d.play === 'quick') { const b = document.getElementById('liveQuick'); if (b) b.focus(); }
    });
  }
  if (d.board) return h.board(d.board);
  if (d.garage) return h.garage();
  return null;
}
