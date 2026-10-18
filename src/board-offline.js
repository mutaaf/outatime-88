// Leaderboard offline (ticket 0158, lazy with the results UI). Boards seen online are kept so
// the leaderboard still shows something on a plane, marked offline. A score whose network
// dropped is kept in an outbox and posted when the connection returns, as long as its signed
// run token is still valid (the server accepts a token for two hours:
// src/worker/plausible.js LIMITS.maxDurationMs). A run started offline has no token and can't
// be posted at all; it stays this device's personal best.
import { call, query } from './leaderboard.js';

const CACHE_KEY = 'outatime88_boards_v1';
const OUTBOX_KEY = 'outatime88_outbox_v1';
export const TOKEN_LIFE_MS = 2 * 3600e3 - 5 * 60e3; // a margin under the server's limit

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch { return fallback; }
}
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full or blocked */ } }

/** GET with a remembered last good answer: `{ ...body, offline: true, cachedAt }` when offline. */
async function cachedGet(path, valid, key = path) {
  const r = await call(path, { method: 'GET' });
  const store = readJSON(CACHE_KEY, {});
  if (r.ok && valid(r.body)) {
    store[key] = { at: Date.now(), body: r.body };
    const keys = Object.keys(store).sort((a, b) => store[b].at - store[a].at);
    for (const k of keys.slice(16)) delete store[k];
    writeJSON(CACHE_KEY, store);
    return r.body;
  }
  if (r.status === 0 && store[key] && valid(store[key].body)) return { ...store[key].body, offline: true, cachedAt: store[key].at };
  return null;
}

/** When a run token was issued (server clock, ms), or 0 if it can't be read. */
export function tokenTime(token) {
  try {
    const body = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const t = JSON.parse(atob(body)).t;
    return Number.isFinite(t) ? t : 0;
  } catch { return 0; }
}

export function outbox() { return readJSON(OUTBOX_KEY, []); }

/** Posts a finished run; if the network is gone, keeps it to post later (`queued: true`). */
export async function submitRunQueued(run) {
  const r = await call('/scores', { method: 'POST', body: JSON.stringify(run) });
  if (r.status === 0 && run && run.token && Date.now() - tokenTime(run.token) < TOKEN_LIFE_MS) {
    writeJSON(OUTBOX_KEY, [...outbox().filter((x) => x.token !== run.token), run].slice(-10));
    return { ...r, queued: true };
  }
  return r;
}

let flushing = false;
/** Posts queued runs (on reconnect and at boot). Expired or rejected runs are dropped. */
export async function flushOutbox(now = Date.now()) {
  if (flushing) return 0;
  flushing = true;
  let posted = 0;
  try {
    const keep = [];
    for (const run of outbox()) {
      if (now - tokenTime(run.token) >= TOKEN_LIFE_MS) continue;
      const r = await call('/scores', { method: 'POST', body: JSON.stringify(run) });
      if (r.ok) posted++;
      else if (r.status === 0) keep.push(run); // still offline
    }
    writeJSON(OUTBOX_KEY, keep);
  } finally { flushing = false; }
  return posted;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOutbox(); });
  setTimeout(() => { if (outbox().length) flushOutbox(); }, 4000);
}


/** fetchBoard / fetchStanding / fetchHall with the offline fallback. */
export function fetchBoardCached(board = 'all', mode = 'ARCADE', limit = 10, opts = {}) {
  return cachedGet(`/scores?${query({ board, mode, limit, level: opts.level, around: opts.around })}`, (b) => b && Array.isArray(b.entries));
}
export function fetchStandingCached({ initials, mode = 'ARCADE', level, since }) {
  // `since` changes every visit, so the cache key leaves it out.
  return cachedGet(`/standing?${query({ initials, mode, level, since })}`, (b) => b && b.boards, `/standing?${query({ initials, mode, level })}`);
}
export function fetchHallCached(mode = 'ARCADE') {
  return cachedGet(`/hall?mode=${mode}`, (b) => b && Array.isArray(b.champions));
}
