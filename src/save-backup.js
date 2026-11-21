// Save backup code (ticket 0296): copy the whole save as one text code, paste it back later or on
// another device. No server, no new storage key: the code is SaveStore.data as JSON, base64url,
// with a version and an FNV-1a checksum, so a truncated or edited paste is refused before it can
// touch the save. Import-free (the settings panel hands in what it needs), so it is its own lazy
// chunk, fetched when Settings opens.
//
//   OT88.1.<base64url JSON>.<8 hex checksum of the payload>

export const CODE_TAG = 'OT88';
export const CODE_VERSION = 1;

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toB64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The save as one copy-paste code. */
export function encodeSave(data) {
  const payload = toB64url(JSON.stringify(data));
  return `${CODE_TAG}.${CODE_VERSION}.${payload}.${fnv1a(payload)}`;
}

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * A pasted code back to save data: { ok: true, data } or { ok: false, reason } with reason
 * 'empty' | 'format' | 'version' | 'checksum' | 'data'. Whitespace and line breaks a chat app or
 * notes app adds are ignored. Never throws.
 */
export function decodeSave(text) {
  const code = String(text == null ? '' : text).replace(/\s+/g, '');
  if (!code) return { ok: false, reason: 'empty' };
  const parts = code.split('.');
  if (parts.length !== 4 || parts[0] !== CODE_TAG || !/^\d+$/.test(parts[1])) return { ok: false, reason: 'format' };
  if (Number(parts[1]) !== CODE_VERSION) return { ok: false, reason: 'version' };
  const [, , payload, sum] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[0-9a-f]{8}$/i.test(sum)) return { ok: false, reason: 'format' };
  if (fnv1a(payload) !== sum.toLowerCase()) return { ok: false, reason: 'checksum' };
  let data;
  try { data = JSON.parse(fromB64url(payload)); } catch (e) { return { ok: false, reason: 'data' }; }
  // A save is an object with a coin count; anything else (a number, a list, another app's JSON) is not one.
  if (!isObj(data) || !Number.isFinite(data.fluxCoins) || data.fluxCoins < 0) return { ok: false, reason: 'data' };
  return { ok: true, data };
}

export const REASON_TEXT = {
  empty: 'Paste a save code first.',
  format: "That isn't a save code. It starts with OT88.",
  version: 'That code comes from a different version of the game, so it can\'t be restored here.',
  checksum: 'That code is incomplete or was changed. Copy the whole code again.',
  data: "That code doesn't hold a save.",
};

const owned = (d) => {
  const g = isObj(d.garage) ? d.garage.owned : null;
  return Array.isArray(g) ? g.length : isObj(g) ? Object.keys(g).length : 0;
};
const races = (d) => (isObj(d.career) && Number.isFinite(d.career.races) ? d.career.races : 0);
const n = (v) => Math.max(0, Math.floor(Number(v) || 0)).toLocaleString('en-US');
const plural = (k, one, many) => `${n(k)} ${Number(k) === 1 ? one : many}`;

/** "1,250 coins · 4 cars · 12 races": what a save holds, for the confirm line. */
export function describeSave(d) {
  return [plural(d.fluxCoins, 'coin', 'coins'), plural(owned(d), 'car', 'cars'), plural(races(d), 'race', 'races')].join(' · ');
}

/**
 * Writes a decoded save as the live save and reloads, so every screen reads it through load()'s
 * normal repair (old shapes keep working). Touches only the save key: identity and other
 * racers' parked saves stay as they are. Returns false if the browser refused the write.
 */
export function restoreSave(store, data, reload) {
  try { localStorage.setItem(store.key, JSON.stringify(data)); } catch (e) { return false; }
  // Nothing may write the old in-memory save over the restored one before the reload: rebuild
  // it from the restored data now (load() merges the save over this.data).
  store.data = {};
  store.load();
  reload();
  return true;
}
