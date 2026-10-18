// Zero-login identity (ticket 0090). Operator-owned (src/worker/ is frozen for agents).
//
// A racer is a random public id (`pub`, 12 base32 chars) the Worker issues on first visit.
// The device proves it owns that id with a credential `pub.sig` (HMAC with the D1-held key):
// a first-party HttpOnly cookie scoped to /outatime/, mirrored by the client into
// localStorage and IndexedDB and sent back as `x-ot-id` when the cookie is gone. No login,
// no PII, no IP: initials and car are the whole profile. IP is used only transiently to
// throttle code redemption (hourly-salted hash, rows deleted after an hour).
//
//   GET  /outatime/api/me                 → { pub, cred, profile, bests, fresh }  (sets the cookie)
//   POST /outatime/api/me                 { initials?, car? } → { profile }
//   POST /outatime/api/me/friends         { add: [pub] } → { profile }
//   POST /outatime/api/me/data            { data } → { profile }   progression blob (see DATA)
//   POST /outatime/api/link               → { code, expiresAt }      6 chars, 10 min, single use
//   POST /outatime/api/link/redeem        { code } → { pub, cred, profile, bests, merged }
//   POST /outatime/api/recovery           → { code }                 replaces any earlier code
//   POST /outatime/api/recovery/redeem    { code } → { pub, cred, profile, bests, merged }
//   POST /outatime/api/use                { cred } → { pub, cred, profile, bests }  switch racer
//   POST /outatime/api/forget             → clears the cookie (the racer stays recoverable)

import { cleanInitials } from './initials.js';

export const COOKIE = 'ot_id';
export const HEADER = 'x-ot-id';
export const PUB_RE = /^[a-z2-7]{12}$/;
export const COOKIE_MAX_AGE = 400 * 86400; // the longest lifetime browsers honour
export const LINK = { ttlMs: 10 * 60e3, length: 6, maxActive: 3 };
export const RECOVERY = { length: 12 };
export const THROTTLE = { windowMs: 15 * 60e3, maxRedeems: 8, maxCreates: 10, keepMs: 3600e3 };
export const MAX_FRIENDS = 40;
// Progression that follows a racer across devices (unlocks, coins, upgrades…). Opaque to the
// Worker apart from shape and size; owners of a key version it themselves ({ v, ... }). Top
// level keys merge on write, so features can extend it without clobbering each other.
export const DATA = { maxBytes: 4096, keyRe: /^[a-z][a-zA-Z0-9_]{0,23}$/, maxKeys: 24 };
const CAR_RE = /^[A-Z0-9_]{1,24}$/;
// No 0/O or 1/I: codes are read aloud and typed by kids.
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomFrom(alpha, n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of bytes) s += alpha[b & 31]; // both alphabets have 32 symbols
  return s;
}

export const newPub = () => randomFrom(B32, 12);

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

export async function credFor(pub, secret) {
  return `${pub}.${b64url((await hmac(secret, `cred|${pub}`)).slice(0, 16))}`;
}

/** The pub a credential proves, or null. */
export async function verifyCred(cred, secret) {
  if (typeof cred !== 'string' || cred.length > 64) return null;
  const [pub, sig] = cred.split('.');
  if (!PUB_RE.test(pub || '') || !sig) return null;
  const want = (await credFor(pub, secret)).split('.')[1];
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? pub : null;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const codeHash = async (kind, code, secret) => hex((await hmac(secret, `${kind}|${code}`)).slice(0, 16));

/** "ab3-dEf" → "AB3DEF"; anything with characters outside the code alphabet → null. */
export function normalizeCode(raw, length) {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== length) return null;
  for (const ch of s) if (!CODE_ALPHA.includes(ch)) return null;
  return s;
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export const setCookie = (cred) =>
  `${COOKIE}=${cred}; Path=/outatime/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
export const clearCookie = () => `${COOKIE}=; Path=/outatime/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Which racer is asking: the cookie wins, the mirrored header restores a lost cookie. */
export async function whoIs(request, secret) {
  const fromCookie = await verifyCred(readCookie(request), secret);
  if (fromCookie) return { pub: fromCookie, via: 'cookie' };
  const fromHeader = await verifyCred(request.headers.get(HEADER), secret);
  if (fromHeader) return { pub: fromHeader, via: 'header' };
  return { pub: null, via: null };
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

async function profileOf(db, pub) {
  const row = await db.prepare('SELECT initials, car, friends, data FROM profiles WHERE pub = ?').bind(pub).first();
  let ids = [];
  let data = {};
  try { ids = JSON.parse(row?.friends || '[]'); } catch { ids = []; }
  try { data = JSON.parse(row?.data || '{}'); } catch { data = {}; }
  let friends = ids.map((id) => ({ pub: id, initials: '' }));
  if (ids.length) {
    const { results } = await db.prepare(`SELECT pub, initials FROM profiles WHERE pub IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    const names = new Map((results || []).map((r) => [r.pub, r.initials]));
    friends = ids.map((id) => ({ pub: id, initials: names.get(id) || '' }));
  }
  return { pub, initials: row?.initials || '', car: row?.car || '', friends, data };
}

/** Personal bests per mode and track, from the racer's posted runs. */
async function bestsOf(db, pub) {
  const { results } = await db.prepare(
    'SELECT mode, level, MAX(score) AS best FROM scores WHERE dev = ? GROUP BY mode, level',
  ).bind(pub).all();
  return (results || []).map((r) => ({ mode: r.mode, level: r.level, best: r.best }));
}

async function upsertProfile(db, pub, now, fields = {}) {
  await db.prepare(
    `INSERT INTO profiles (pub, initials, car, friends, created_at, seen_at) VALUES (?, ?, ?, '[]', ?, ?)
     ON CONFLICT(pub) DO UPDATE SET seen_at = excluded.seen_at`,
  ).bind(pub, fields.initials || '', fields.car || '', now, now).run();
  if (fields.initials !== undefined) await db.prepare('UPDATE profiles SET initials = ? WHERE pub = ?').bind(fields.initials, pub).run();
  if (fields.car !== undefined) await db.prepare('UPDATE profiles SET car = ? WHERE pub = ?').bind(fields.car, pub).run();
  if (fields.data !== undefined) await db.prepare('UPDATE profiles SET data = ? WHERE pub = ?').bind(JSON.stringify(fields.data), pub).run();
  if (fields.friends !== undefined) await db.prepare('UPDATE profiles SET friends = ? WHERE pub = ?').bind(JSON.stringify(fields.friends), pub).run();
}

/** Hourly-salted, so the stored key can't be joined to anything after the hour. */
export async function throttleKey(kind, ip, secret, now) {
  return `${kind}|${hex((await hmac(secret, `ip|${ip}|${Math.floor(now / 3600e3)}`)).slice(0, 10))}`;
}

export async function throttled(db, key, max, now) {
  await db.prepare('DELETE FROM throttle WHERE at < ?').bind(now - THROTTLE.keepMs).run();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM throttle WHERE key = ? AND at > ?').bind(key, now - THROTTLE.windowMs).first();
  if ((row?.n ?? 0) >= max) return true;
  await db.prepare('INSERT INTO throttle (key, at) VALUES (?, ?)').bind(key, now).run();
  return false;
}

/**
 * Move device racer `from` into racer `to`: its runs, friends and (if `to` has none) its
 * initials. The device then holds `to`'s credential.
 */
export async function mergeRacers(db, from, to, now) {
  if (!from || from === to) return false;
  const [a, b] = await Promise.all([profileOf(db, from), profileOf(db, to)]);
  const friends = [...new Set([...b.friends.map((f) => f.pub), ...a.friends.map((f) => f.pub)])]
    .filter((p) => p !== to && p !== from).slice(-MAX_FRIENDS);
  await db.prepare('UPDATE scores SET dev = ? WHERE dev = ?').bind(to, from).run();
  const data = { ...a.data, ...b.data };
  await upsertProfile(db, to, now, { friends, data, ...(b.initials ? {} : { initials: a.initials }), ...(b.car ? {} : { car: a.car }) });
  await db.prepare('DELETE FROM profiles WHERE pub = ?').bind(from).run();
  return true;
}

async function sessionBody(db, pub, secret) {
  const [profile, bests] = await Promise.all([profileOf(db, pub), bestsOf(db, pub)]);
  return { pub, cred: await credFor(pub, secret), profile, bests };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > DATA.maxBytes + 1024) return null;
  try { return text ? JSON.parse(text) : {}; } catch { return null; }
}

/**
 * Identity routes. Returns a Response, or null when the path isn't one of ours.
 * deps: { db, now, ip, secret: () => Promise<string> }
 */
export async function handleIdentity(request, path, deps) {
  const { db, ip } = deps;
  const routes = ['/outatime/api/me', '/outatime/api/me/friends', '/outatime/api/me/data', '/outatime/api/link', '/outatime/api/link/redeem',
    '/outatime/api/recovery', '/outatime/api/recovery/redeem', '/outatime/api/forget', '/outatime/api/use'];
  if (!routes.includes(path)) return null;
  const now = deps.now();
  const secret = await deps.secret();
  const who = await whoIs(request, secret);
  const method = request.method;

  if (path === '/outatime/api/me' && method === 'GET') {
    // A new visitor gets an id but no row: profiles are written on first save or run.
    const pub = who.pub || newPub();
    const body = await sessionBody(db, pub, secret);
    const fresh = !who.pub;
    return json(200, { ...body, fresh }, who.via === 'cookie' ? {} : { 'set-cookie': setCookie(body.cred) });
  }
  if (path === '/outatime/api/forget' && method === 'POST') {
    return json(200, { ok: true }, { 'set-cookie': clearCookie() });
  }
  if (method !== 'POST') return json(405, { error: 'method not allowed' });
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json(400, { error: 'bad json' });

  if (path === '/outatime/api/use') {
    // Switch racer on a shared device: any credential this device already holds.
    const pub = await verifyCred(body.cred, secret);
    if (!pub) return json(403, { error: 'unknown racer' });
    const out = await sessionBody(db, pub, secret);
    return json(200, out, { 'set-cookie': setCookie(out.cred) });
  }
  if (path === '/outatime/api/link/redeem' || path === '/outatime/api/recovery/redeem') {
    const isLink = path === '/outatime/api/link/redeem';
    if (await throttled(db, await throttleKey('redeem', ip || 'unknown', secret, now), THROTTLE.maxRedeems, now)) {
      return json(429, { error: 'too many tries — wait a few minutes' });
    }
    const code = normalizeCode(body.code, isLink ? LINK.length : RECOVERY.length);
    if (!code) return json(400, { error: 'that code doesn’t look right' });
    const h = await codeHash(isLink ? 'link' : 'recovery', code, secret);
    let target = null;
    if (isLink) {
      const row = await db.prepare('SELECT pub FROM link_codes WHERE code_hash = ? AND used = 0 AND expires_at > ?').bind(h, now).first();
      if (row) {
        // Single use even under a race: only the request that flips `used` wins.
        const res = await db.prepare('UPDATE link_codes SET used = 1 WHERE code_hash = ? AND used = 0').bind(h).run();
        if (res.meta?.changes === 1) target = row.pub;
      }
    } else {
      const row = await db.prepare('SELECT pub FROM recovery WHERE code_hash = ?').bind(h).first();
      target = row?.pub || null;
    }
    if (!target) return json(404, { error: isLink ? 'code expired or already used' : 'no racer with that code' });
    const merged = await mergeRacers(db, who.pub, target, now);
    await upsertProfile(db, target, now);
    const out = await sessionBody(db, target, secret);
    return json(200, { ...out, merged }, { 'set-cookie': setCookie(out.cred) });
  }

  // Everything below acts on the asking racer, so it needs a valid credential.
  if (!who.pub) return json(401, { error: 'no racer on this device yet' });
  const pub = who.pub;

  if (path === '/outatime/api/me') {
    const fields = {};
    if (body.initials !== undefined) {
      const ini = cleanInitials(body.initials);
      if (!ini) return json(400, { error: 'initials must be three letters' });
      fields.initials = ini;
    }
    if (body.car !== undefined) {
      if (typeof body.car !== 'string' || !CAR_RE.test(body.car)) return json(400, { error: 'bad car' });
      fields.car = body.car;
    }
    await upsertProfile(db, pub, now, fields);
    return json(200, { profile: await profileOf(db, pub) });
  }
  if (path === '/outatime/api/me/friends') {
    const add = Array.isArray(body.add) ? body.add.filter((p) => typeof p === 'string' && PUB_RE.test(p) && p !== pub).slice(0, MAX_FRIENDS) : [];
    const current = (await profileOf(db, pub)).friends.map((f) => f.pub);
    const friends = [...current.filter((p) => !add.includes(p)), ...add].slice(-MAX_FRIENDS);
    await upsertProfile(db, pub, now, { friends });
    return json(200, { profile: await profileOf(db, pub) });
  }
  if (path === '/outatime/api/me/data') {
    const patch = body.data;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json(400, { error: 'data must be an object' });
    if (!Object.keys(patch).every((k) => DATA.keyRe.test(k))) return json(400, { error: 'bad data key' });
    const merged = { ...(await profileOf(db, pub)).data };
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete merged[k]; else merged[k] = v; }
    if (Object.keys(merged).length > DATA.maxKeys || JSON.stringify(merged).length > DATA.maxBytes) return json(413, { error: 'profile data too large' });
    await upsertProfile(db, pub, now, { data: merged });
    return json(200, { profile: await profileOf(db, pub) });
  }
  if (path === '/outatime/api/link' || path === '/outatime/api/recovery') {
    const isLink = path === '/outatime/api/link';
    if (await throttled(db, `create|${pub}`, THROTTLE.maxCreates, now)) return json(429, { error: 'slow down' });
    await upsertProfile(db, pub, now);
    const code = randomFrom(CODE_ALPHA, isLink ? LINK.length : RECOVERY.length);
    const h = await codeHash(isLink ? 'link' : 'recovery', code, secret);
    if (isLink) {
      await db.prepare('DELETE FROM link_codes WHERE expires_at < ? OR used = 1').bind(now).run();
      const live = await db.prepare('SELECT code_hash FROM link_codes WHERE pub = ? ORDER BY expires_at DESC').bind(pub).all();
      for (const r of (live.results || []).slice(LINK.maxActive - 1)) {
        await db.prepare('DELETE FROM link_codes WHERE code_hash = ?').bind(r.code_hash).run();
      }
      const expiresAt = now + LINK.ttlMs;
      await db.prepare('INSERT INTO link_codes (code_hash, pub, expires_at) VALUES (?, ?, ?)').bind(h, pub, expiresAt).run();
      return json(200, { code, expiresAt });
    }
    await db.prepare('INSERT OR REPLACE INTO recovery (pub, code_hash, created_at) VALUES (?, ?, ?)').bind(pub, h, now).run();
    return json(200, { code: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` });
  }
  return json(405, { error: 'method not allowed' });
}
