// Zero-login identity, client side (ticket 0090). The one module rooms, share links, rivals
// and friends use to know who is playing:
//
//   await initIdentity()      once at boot; silent, fail-soft (offline → null session)
//   publicId()                this racer's public id (safe to put in links and rooms)
//   profile()                 { pub, initials, car, friends: [{ pub, initials }] } or null
//   addFriends([pub])         remember people you raced or who challenged you
//   setProfile({ initials, car })
//   profileData() / saveProfileData({ key: value })   progression that follows the racer
//                             across devices; top-level keys merge, null deletes, ≤ 4 kB
//   onIdentity(fn)            called whenever the active racer or profile changes
//   authHeaders()             { 'x-ot-id': cred } for our own /outatime/api calls
//   createLinkCode / redeemCode / createRecoveryCode / racers / switchRacer / newRacer / forgetDevice
//
// The Worker sets an HttpOnly cookie; this module mirrors the credential into localStorage
// and IndexedDB so clearing one store doesn't lose the racer. The credential (`pub.sig`) is a
// secret — never put it in a URL; share publicId() instead.

const API = `${import.meta.env.BASE_URL}api`;
export const STORE_KEY = 'outatime88_identity_v1';
const IDB = { name: 'outatime88', store: 'kv', key: 'identity' };
export const PUB_RE = /^[a-z2-7]{12}$/;
const TIMEOUT_MS = 6000;

let session = null; // { pub, cred, profile, bests }
let local = { active: '', racers: [] }; // racers: [{ pub, cred, initials, car }]
const listeners = new Set();

function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return v && Array.isArray(v.racers) ? v : null;
  } catch { return null; }
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
    const req = indexedDB.open(IDB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const r = db.transaction(IDB.store).objectStore(IDB.store).get(IDB.key);
      r.onsuccess = () => resolve(r.result && Array.isArray(r.result.racers) ? r.result : null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}
async function idbSet(value) {
  try {
    const db = await idbOpen();
    db.transaction(IDB.store, 'readwrite').objectStore(IDB.store).put(value, IDB.key);
  } catch { /* private mode: localStorage and the cookie still hold it */ }
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(local)); } catch { /* full or blocked */ }
  idbSet(JSON.parse(JSON.stringify(local)));
}

async function call(method, path, body, cred = session?.cred) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'content-type': 'application/json' };
    if (cred) headers['x-ot-id'] = cred;
    const res = await fetch(`${API}${path}`, {
      method, headers, credentials: 'same-origin', signal: ctrl.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: data };
  } catch {
    return { ok: false, status: 0, body: {} };
  } finally {
    clearTimeout(timer);
  }
}

const emit = () => listeners.forEach((fn) => { try { fn(session); } catch { /* listener bug */ } });

function remember(s) {
  const entry = { pub: s.pub, cred: s.cred, initials: s.profile?.initials || '', car: s.profile?.car || '' };
  local.racers = [entry, ...local.racers.filter((r) => r.pub !== s.pub)].slice(0, 8);
  local.active = s.cred;
}

function adopt(body) {
  if (!body || !PUB_RE.test(body.pub || '') || typeof body.cred !== 'string') return null;
  session = { pub: body.pub, cred: body.cred, profile: body.profile || { pub: body.pub, initials: '', car: '', friends: [] }, bests: body.bests || [] };
  remember(session);
  persist();
  emit();
  return session;
}

/** Restores (cookie → localStorage → IndexedDB) or silently creates this device's racer. */
export async function initIdentity() {
  local = readLocal() || (await idbGet()) || { active: '', racers: [] };
  const r = await call('GET', '/me', undefined, local.active || undefined);
  if (r.ok) return adopt(r.body);
  // Offline: keep playing as the last known racer; the server catches up next time.
  const last = local.racers.find((x) => x.cred === local.active);
  if (last) session = { pub: last.pub, cred: last.cred, profile: { pub: last.pub, initials: last.initials, car: last.car, friends: [] }, bests: [] };
  return session;
}

export const publicId = () => session?.pub || null;
export const profile = () => session?.profile || null;
export const bests = () => session?.bests || [];
export const authHeaders = () => (session?.cred ? { 'x-ot-id': session.cred } : {});
export function onIdentity(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Racers this device has played as (newest first), for "Switch racer". */
export const racers = () => local.racers.map(({ pub, initials, car }) => ({ pub, initials, car, active: pub === session?.pub }));

export async function setProfile(fields) {
  if (!session) return null;
  const r = await call('POST', '/me', fields);
  if (!r.ok) return null;
  session.profile = r.body.profile;
  remember(session);
  persist();
  emit();
  return session.profile;
}

export async function addFriends(pubs) {
  const add = (pubs || []).filter((p) => PUB_RE.test(p) && p !== session?.pub);
  if (!session || !add.length) return null;
  const r = await call('POST', '/me/friends', { add });
  if (!r.ok) return null;
  session.profile = r.body.profile;
  emit();
  return session.profile;
}

export const profileData = () => session?.profile?.data || {};

export async function saveProfileData(patch) {
  if (!session) return null;
  const r = await call('POST', '/me/data', { data: patch });
  if (!r.ok) return null;
  session.profile = r.body.profile;
  emit();
  return session.profile.data;
}

/** { code, expiresAt } — 6 characters, 10 minutes, one use. */
export async function createLinkCode() {
  const r = await call('POST', '/link', {});
  return r.ok ? r.body : { error: r.body.error || 'offline' };
}

/** "Save my racer": a long-lived code to write down. Making a new one retires the old one. */
export async function createRecoveryCode() {
  const r = await call('POST', '/recovery', {});
  return r.ok ? r.body : { error: r.body.error || 'offline' };
}

/** A 6-character link code or a 12-character recovery code → this device becomes that racer. */
export async function redeemCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const path = code.length === 12 ? '/recovery/redeem' : '/link/redeem';
  const r = await call('POST', path, { code });
  if (!r.ok) return { error: r.body.error || (r.status === 0 ? 'offline — try again' : 'that code didn’t work') };
  adopt(r.body);
  return { ok: true, merged: Boolean(r.body.merged), session };
}

export async function switchRacer(pub) {
  const target = local.racers.find((x) => x.pub === pub);
  if (!target) return null;
  const r = await call('POST', '/use', { cred: target.cred }, target.cred);
  return r.ok ? adopt(r.body) : null;
}

/** A brand-new racer on this device (a sibling's first go). Others stay in the list. */
export async function newRacer() {
  await call('POST', '/forget', {}, null);
  const r = await call('GET', '/me', undefined, null);
  return r.ok ? adopt(r.body) : null;
}

/** "Forget this device": drop the current racer from every local store and the cookie. */
export async function forgetDevice() {
  const gone = session?.pub;
  await call('POST', '/forget', {}, null);
  local.racers = local.racers.filter((x) => x.pub !== gone);
  local.active = '';
  session = null;
  persist();
  const next = local.racers[0];
  return next ? switchRacer(next.pub) : newRacer();
}

/** Test hook: forget in-memory state (as if the page reloaded). */
export function _resetForTests() { session = null; local = { active: '', racers: [] }; listeners.clear(); }
