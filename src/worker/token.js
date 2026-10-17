// Signed run tokens (ticket 0024). The server issues one when a run starts; a score is only
// accepted with a token it signed, and the token's server-side timestamp bounds how long the
// run can possibly have lasted. Stateless HMAC-SHA256; the key never leaves the Worker.

const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function randomId(bytes = 12) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** payload: { id, t (ms, server clock) } → "<payload>.<sig>" */
export async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload if the signature is valid, otherwise null. */
export async function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return payload && typeof payload.id === 'string' && Number.isFinite(payload.t) ? payload : null;
  } catch {
    return null;
  }
}
