// TV mode pairing rules (ticket 0175): one TV screen + up to two phone pads per 4-letter
// code. Pure and synchronous, so every rule is unit-testable; the PadRoom Durable Object
// (pad.js) only stores two numbers and relays. Nothing personal: no names, no ids, no IPs.
//
// Wire format (all JSON text frames):
//   server → TV   {t:'join',s}  {t:'leave',s}  {t:'m',s,d}        (d = whatever the pad sent)
//   server → pad  {t:'hi',s,tv} {t:'tv-gone'}  {t:'tv-back'}  {t:'m',d}  {t:'err',code}
//   (the TV connects with ?role=tv&key=<the key from POST /api/pad>; phones need only the code)
//   TV → server   {to: 0 | 1 | 'all', d}
//   pad → server  any JSON value (relayed to the TV as d)
// Input normally flows phone → TV over a WebRTC DataChannel (signalled through these same
// messages); this relay is the fallback, so it is rate-limited, not tuned for 120 Hz.

export const PAD = Object.freeze({
  ttlMs: 10 * 60e3,       // an unpaired code stops accepting phones after 10 minutes
  idleMs: 15 * 60e3,      // a session nobody is connected to is wiped
  maxPads: 2,
  maxMsgBytes: 4096,      // fits a WebRTC offer/answer
  rate: { perSec: 70, burst: 140 },
  joinsPerMin: 30,        // WebSocket joins per IP per minute (TV + phones)
});

export const ROLES = Object.freeze(['tv', 'pad']);
export const KEY_RE = /^[0-9a-f]{32}$/;

/** A fresh 128-bit TV key, hex. Only the TV that minted the code ever sees it. */
export function makeKey(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(rand(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (no early exit on the first differing character). */
export function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * May this socket join? `sess` = { at, paired, key } from storage (or null), `tvOn` whether a
 * TV socket is open, `slots` = slots already taken by open pads, `want` = a slot hint
 * (reconnect), `key` = the key a TV presents. Phones need only the code; the TV role needs
 * the secret key minted with it, so guessing a code can never take over someone's screen.
 * → { ok: true, slot } | { error }
 */
export function admit(role, sess, now, { tvOn = false, slots = [], want = -1, key = '' } = {}) {
  if (!ROLES.includes(role)) return { error: 'BAD_ROLE' };
  if (!sess || !sess.at) return { error: 'NO_CODE' };
  if (role === 'tv') return sess.key && sameKey(key, sess.key) ? { ok: true, slot: -1 } : { error: 'BAD_KEY' };
  if (!tvOn) return { error: 'NO_TV' };
  if (!sess.paired && now - sess.at > PAD.ttlMs) return { error: 'EXPIRED' };
  const free = [];
  for (let s = 0; s < PAD.maxPads; s++) if (!slots.includes(s)) free.push(s);
  if (!free.length) return { error: 'FULL' };
  return { ok: true, slot: free.includes(want) ? want : free[0] };
}

/** A pad's frame, wrapped for the TV; null if it isn't a small JSON value. */
export function fromPad(slot, data) {
  if (typeof data !== 'string' || data.length > PAD.maxMsgBytes) return null;
  try { return JSON.stringify({ t: 'm', s: slot, d: JSON.parse(data) }); } catch { return null; }
}

/** A TV frame → { to: slot | 'all', text } for the pads; null if malformed. */
export function fromTv(data) {
  if (typeof data !== 'string' || data.length > PAD.maxMsgBytes) return null;
  let m;
  try { m = JSON.parse(data); } catch { return null; }
  if (!m || typeof m !== 'object' || !('d' in m)) return null;
  const to = m.to === 'all' ? 'all' : Number.isInteger(m.to) && m.to >= 0 && m.to < PAD.maxPads ? m.to : null;
  if (to == null) return null;
  return { to, text: JSON.stringify({ t: 'm', d: m.d }) };
}

/**
 * Per-IP fixed-window throttle on WebSocket joins (TV and phone alike). A home shares one IP
 * between the TV and both phones, so it allows reconnect storms on bad Wi-Fi, but it makes
 * walking the 194,481 codes hopeless. → true if this join may proceed.
 */
export function joinAllowed(map, ip, now, { windowMs = 60e3, max = PAD.joinsPerMin } = {}) {
  const row = map.get(ip);
  if (!row || now - row.at > windowMs) {
    if (map.size > 5000) map.clear();
    map.set(ip, { at: now, n: 1 });
    return true;
  }
  row.n += 1;
  return row.n <= max;
}

/** Token bucket, same shape as the race rooms' (room-core.js allow). */
export function padAllow(bucket, now, { perSec, burst } = PAD.rate) {
  const elapsed = Math.max(0, now - (bucket.at || now)) / 1000;
  bucket.tokens = Math.min(burst, (bucket.tokens ?? burst) + elapsed * perSec);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
