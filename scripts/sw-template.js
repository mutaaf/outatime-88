// OUTATIME 88 service worker (ticket 0075). Generated at build time by vite.config.js, which
// fills in VERSION and PRECACHE. Rules:
//   /outatime/api/*   never touched (network only: leaderboard, identity, live rooms)
//   page navigations  network first, cached copy when offline (so a deploy shows up at once)
//   /outatime/assets/ cache first (file names are content hashes, so they never go stale)
// Old caches are deleted when a new version activates.
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const PRECACHE = JSON.parse('__PRECACHE__');
const CACHE = `outatime88-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([BASE, ...PRECACHE.map((f) => BASE + f)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('outatime88-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.startsWith(`${BASE}api/`)) return; // network only, never cached

  if (req.mode === 'navigate' || url.pathname === BASE || url.pathname === `${BASE}index.html`) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(BASE, res.clone());
        return res;
      } catch {
        return (await caches.match(BASE)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
  }
});
