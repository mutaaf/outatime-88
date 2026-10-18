// Leaderboard client (ticket 0025). Talks only to our own origin (/outatime/api/*). Every
// call fails soft: the game never waits on the network and never shows an error dialog.

import { authHeaders } from './identity.js';

const API = `${import.meta.env.BASE_URL}api`;
const TIMEOUT_MS = 6000;

/** One API call; never throws. `status` 0 means the network is gone. */
export async function call(path, init) {
  // Certainly offline (a plane): answer at once instead of waiting out the timeout.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, status: 0, body: {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Runs count for this device's racer (ticket 0090): the cookie, or its mirrored credential.
    const res = await fetch(`${API}${path}`, {
      ...init, signal: ctrl.signal, credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...authHeaders() },
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: {} };
  } finally {
    clearTimeout(timer);
  }
}

/** Starts a run: asks the server for a signed token. Resolves to the token or null. */
export async function beginRun() {
  const r = await call('/run', { method: 'POST', body: '{}' });
  return r.ok && typeof r.body.token === 'string' ? r.body.token : null;
}

export async function submitRun(run) {
  return call('/scores', { method: 'POST', body: JSON.stringify(run) });
}

export const query = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

/** opts: { level, around } — a per-track board and your own row even outside the top N. */
export async function fetchBoard(board = 'all', mode = 'ARCADE', limit = 10, opts = {}) {
  const r = await call(`/scores?${query({ board, mode, limit, level: opts.level, around: opts.around })}`, { method: 'GET' });
  return r.ok && Array.isArray(r.body.entries) ? r.body : null;
}

/** Your rank on every board, your rival, streak, and who passed you since `since` (ticket 0091). */
export async function fetchStanding({ initials, mode = 'ARCADE', level, since }) {
  const r = await call(`/standing?${query({ initials, mode, level, since })}`, { method: 'GET' });
  return r.ok && r.body.boards ? r.body : null;
}

/** A ghost to race on a track: that player's best, else the track record (ticket 0092). */
export async function fetchGhost(mode, level, initials) {
  const r = await call(`/ghost?${query({ mode, level, initials })}`, { method: 'GET' });
  return r.ok && typeof r.body.trace === 'string' ? r.body : null;
}

/** Past weekly champions, newest first. */
export async function fetchHall(mode = 'ARCADE') {
  const r = await call(`/hall?mode=${mode}`, { method: 'GET' });
  return r.ok && Array.isArray(r.body.champions) ? r.body : null;
}

/** "abc" → "ABC"; anything that isn't 3 letters → null (the server re-checks and filters). */
export function normalizeInitials(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  return s.length === 3 ? s : null;
}

/** One line for the results screen. */
export function rankLine(rank) {
  if (!rank) return '';
  return `#${rank.all} ALL-TIME · #${rank.daily} TODAY`;
}
