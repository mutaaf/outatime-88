---
id: 0075
title: A service worker for instant repeat loads and offline solo races
status: shipped
priority: P2
size: S
lens: performance
created: 2026-10-17
pr: 41
---

## Why
Every visit re-downloaded the game over the network, and a flaky phone connection meant no
game at all. Kids play in the car.

## What
`vite.config.js` emits `dist/outatime/sw.js` from `scripts/sw-template.js` with a content
version (hash of the asset list) and a precache of the boot files (main JS/CSS, garage chunk,
latin fonts; the 3D chunk and other font subsets are cached the first time they're used).
- `/outatime/api/*` (leaderboard, identity, live-room websocket upgrade) is never handled:
  straight to the network, never cached. Other origins are ignored.
- Page navigations: network first, cached copy offline, so a deploy shows up immediately.
- `/outatime/assets/*`: cache first (content-hashed names never go stale).
- New versions install alongside, activate, and delete old `outatime88-*` caches.
- `sw.js` is served `Cache-Control: no-cache` (via `_headers`) so updates are seen at once.
- Registered from main.js in production builds only, scoped to `/outatime/`; `?nosw` skips it.

## Acceptance criteria
- [x] Repeat load is served by the SW; the title boots and a race starts offline
- [x] No API response is ever cached
- [x] Works under the /outatime/ base path; versioned; old caches removed
- [x] Live rooms still connect with the SW active (live e2e runs against the prod build)

## Test plan
`tests/e2e/offline.spec.js` (build output: version, precache, no 3D chunk, headers; runtime:
controlled reload uses the SW, API not cached, offline boot + race). Full suite including
`live.spec.js` (wrangler dev, SW active) green.

## Out of scope
An install prompt / web app manifest.
