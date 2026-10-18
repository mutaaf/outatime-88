// OUTATIME 88 service worker (tickets 0075, 0158). Generated at build time by vite.config.js
// (scripts/precache.mjs), which fills in VERSION and PRECACHE from the real build output, so
// every chunk, sound, font, icon and ad creative is listed without anyone maintaining a list.
//
// Rules:
//   /outatime/api/*        never touched (network only: leaderboard, identity, live rooms)
//   page navigations       network first with a short timeout, cached page when offline or on
//                          airplane "lie-fi" (any ?level= / ?play= / ?board= deep link works)
//   hashed /assets/ files  cache first (content-hashed names never go stale)
//   other game files       stale-while-revalidate (ads manifest, web manifest, icons)
//
// Updates are atomic: a new version downloads everything into its own cache while the old one
// keeps serving; only a complete download activates. The previous version's cache is kept one
// generation so a tab still running old code can lazy-load its old chunks; older ones go.
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const PRECACHE = JSON.parse('__PRECACHE__');
const PREFIX = 'outatime88-';
const CACHE = `${PREFIX}${VERSION}`;
const NAV_TIMEOUT_MS = 3500;
const CONCURRENCY = 6;

let progress = { version: VERSION, done: 0, total: PRECACHE.length + 1, ready: false };

async function tell(msg) {
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of all) c.postMessage(msg);
}

async function fetchInto(cache, path) {
  // `reload` skips the HTTP cache so a half-deployed edge copy can't poison the precache.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(new Request(BASE + path, { cache: 'reload', credentials: 'same-origin' }));
      if (res.ok) { await cache.put(BASE + path, res); return; }
    } catch { /* retry */ }
  }
  throw new Error(`precache failed: ${path}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Files the previous version already holds (same hashed name) are copied, not re-downloaded.
    const queue = ['', ...PRECACHE];
    let next = 0, lastTold = 0;
    async function worker() {
      while (next < queue.length) {
        const path = queue[next++];
        const old = path && path.startsWith('assets/') ? await caches.match(BASE + path, { ignoreVary: true }) : null;
        if (old) await cache.put(BASE + path, old);
        else await fetchInto(cache, path);
        progress.done++;
        const now = Date.now();
        if (now - lastTold > 150 || progress.done === progress.total) { lastTold = now; tell({ type: 'ot-sw', ...progress }); }
      }
    }
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (e) {
      await caches.delete(CACHE); // never activate a half-filled version
      throw e;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const mine = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
    // Keep the newest older version (by the order caches.keys() returns: creation order).
    const keep = mine.slice(-1);
    for (const key of mine) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
    progress = { ...progress, done: progress.total, ready: true };
    tell({ type: 'ot-sw', ...progress });
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'ot-sw-status') {
    event.waitUntil((async () => {
      // Count what this version actually holds (survives the worker being restarted).
      const cache = await caches.open(CACHE);
      const keys = await cache.keys();
      const have = new Set(keys.map((r) => new URL(r.url).pathname));
      const done = [BASE, ...PRECACHE.map((f) => BASE + f)].filter((p) => have.has(p)).length;
      const ready = done === PRECACHE.length + 1;
      const bytes = data.withSize ? await sizeOf(cache, keys) : undefined;
      event.source && event.source.postMessage({ type: 'ot-sw', version: VERSION, done, total: PRECACHE.length + 1, ready, bytes });
    })());
  }
});

async function sizeOf(cache, keys) {
  let n = 0;
  for (const k of keys) {
    const r = await cache.match(k);
    if (r) n += (await r.clone().arrayBuffer()).byteLength;
  }
  return n;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.startsWith(`${BASE}api/`)) return; // network only, never cached
  if (url.pathname === `${BASE}sw.js`) return;

  if (req.mode === 'navigate' || url.pathname === BASE || url.pathname === `${BASE}index.html`) {
    event.respondWith((async () => {
      try {
        // Airplane Wi-Fi often "connects" but never answers: don't wait for it forever.
        const res = await Promise.race([fetch(req), timeout(NAV_TIMEOUT_MS)]);
        if (res.ok && res.type === 'basic') (await caches.open(CACHE)).put(BASE, res.clone());
        return res;
      } catch {
        return (await caches.match(BASE, { ignoreSearch: true, ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // Everything else under the base (ads manifest + creatives, web manifest, icons):
  // answer from the cache at once, refresh it in the background.
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
    const refresh = fetch(req).then(async (res) => {
      if (res.ok) await (await caches.open(CACHE)).put(url.pathname, res.clone());
      return res;
    });
    if (hit) { event.waitUntil(refresh.catch(() => {})); return hit; }
    return refresh;
  })());
});
