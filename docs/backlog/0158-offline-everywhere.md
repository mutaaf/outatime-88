---
id: 0158
title: Offline everywhere — the whole game on a plane, in every major browser
status: in-progress
priority: P0
size: M
lens: tech-health
created: 2026-10-18
---

## Why
The user: "this should be able to run in safari offline in an airplane" — "or whatever browser".
The service worker (0075) only precached the boot files; the 3D view, sounds, most fonts and
the ad manifest were cached on first use, so a flight could start with half the game missing.
A cross-origin `Vary` mismatch also meant `crossorigin` module scripts could miss the cache.

## What
- `sw.js` precaches every build output and public file the game needs, from the real build
  (`scripts/precache.mjs`): every lazy chunk, sound, latin font, icon and ad file (~1.9 MB).
  Version = hash of every file's contents. Atomic install (half-filled versions are deleted),
  one previous version kept so an old tab can still lazy-load, a stale chunk reloads once.
- Navigations: network first with a 3.5 s timeout (airplane "lie-fi"), cached page otherwise,
  any deep link. Matches ignore `Vary` and the query.
- Offline degrade: the leaderboard shows the last board it saw marked offline; a run whose
  connection dropped is queued and posted on reconnect while its token is valid (2 h); a run
  started offline says it's saved as this device's best; live friends say NEEDS INTERNET;
  identity and leaderboard calls return at once when `navigator.onLine` is false; ad totals
  wait in storage.
- A title pill: SAVING FOR OFFLINE n% → READY FOR OFFLINE → PLAYING OFFLINE. A one-time hint:
  iOS/iPadOS Safari "Add to Home Screen" (Safari can clear a site after 7 days unvisited),
  Chrome/Edge/Samsung install prompt, Firefox keep-storage (persist prompt only from a tap).
  `navigator.storage.persist()` silently elsewhere.

## Acceptance criteria
- After one online visit, offline reload boots, races in 2D and 3D, loads sounds and shows the
  leaderboard (offline badge) in Chromium and WebKit (desktop + iPhone); Firefox in CI.
- The precache list equals the build output after the skip rules (test).
- A dropped-connection score posts itself when the network returns.

## Test plan
- `tests/e2e/offline.spec.js` (Chromium, Firefox, WebKit, WebKit iPhone projects).
- `tests/unit/offline.test.js`, the billboards offline test.
- Real devices: iPhone Safari tab and Home Screen app in airplane mode; Android Chrome; Firefox.
