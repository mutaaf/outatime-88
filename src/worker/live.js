// Live multiplayer routes (sprint 3). Returns a Response for /room and /quick paths, or null so
// the caller falls through to the leaderboard.

import { makeCode, cleanCode } from './live-rules.js';
import { json, ensureSchema, signingSecret } from './scores.js';
import { whoIs } from './identity.js';

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

// Best-effort per-isolate throttle on room creation (rooms are free, but quota isn't).
const created = new Map();
const CREATE = { windowMs: 60e3, max: 10 };
export function createAllowed(ip, now, map = created) {
  const row = map.get(ip);
  if (!row || now - row.at > CREATE.windowMs) { map.set(ip, { at: now, n: 1 }); return true; }
  row.n += 1;
  if (map.size > 5000) map.clear();
  return row.n <= CREATE.max;
}

/** Same-origin only: a page on another site can't open sockets into our rooms. */
export function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

export async function handleLive(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/outatime/api/room' && path !== '/outatime/api/quick' && !path.startsWith('/outatime/api/room/')) return null;
  if (!env.ROOMS || !env.MATCH) return json(503, { error: 'live races offline' });
  const ip = request.headers.get('cf-connecting-ip') || '';
  // wrangler dev in CI (LIVE_TEST=1, never set in production): every test browser is one IP,
  // and the flake guard re-runs the live specs back to back, so the room throttle stays off.
  const testing = env.LIVE_TEST === '1';

  if (path === '/outatime/api/room' && request.method === 'POST') {
    if (!testing && !createAllowed(ip, Date.now())) return json(429, { error: 'slow down' });
    for (let i = 0; i < 6; i++) {
      const code = makeCode(rand);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, public: false }) });
      if (res.ok) return json(200, { code });
    }
    return json(503, { error: 'busy' });
  }

  if (path === '/outatime/api/quick' && request.method === 'POST') {
    if (!testing && !createAllowed(ip, Date.now())) return json(429, { error: 'slow down' });
    const stub = env.MATCH.get(env.MATCH.idFromName('global'));
    const res = await stub.fetch('https://match/quick', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    return json(res.ok ? 200 : 503, body);
  }

  const code = cleanCode(path.slice('/outatime/api/room/'.length));
  if (!code) return json(404, { error: 'no such room' });
  if (request.headers.get('upgrade') !== 'websocket') return json(426, { error: 'websocket only' });
  if (!sameOrigin(request, url)) return json(403, { error: 'bad origin' });
  // Seats follow the racer (ticket 0090): the identity cookie rides along with the upgrade.
  // Only the verified public id goes to the room — never the credential.
  const fwd = new Request(request);
  fwd.headers.delete('x-ot-racer');
  const pub = await racerOf(request, env);
  if (pub) fwd.headers.set('x-ot-racer', pub);
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(fwd);
}

/** The verified racer public id from the identity cookie, or null (fail-soft). */
export async function racerOf(request, env) {
  if (!env.DB) return null;
  try {
    await ensureSchema(env.DB);
    const who = await whoIs(request, await signingSecret(env.DB));
    return who.pub;
  } catch {
    return null;
  }
}
