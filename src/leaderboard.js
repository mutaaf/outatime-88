// Leaderboard client (ticket 0025). Talks only to our own origin (/outatime/api/*). Every
// call fails soft: the game never waits on the network and never shows an error dialog.

const API = `${import.meta.env.BASE_URL}api`;
const TIMEOUT_MS = 6000;

async function call(path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { 'content-type': 'application/json' } });
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

export async function fetchBoard(board = 'all', mode = 'ARCADE', limit = 10) {
  const r = await call(`/scores?board=${board}&mode=${mode}&limit=${limit}`, { method: 'GET' });
  return r.ok && Array.isArray(r.body.entries) ? r.body : null;
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
