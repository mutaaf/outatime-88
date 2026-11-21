---
id: 0293
title: A MPH / KM/H setting, so the whole world reads its own speed (88 mph = 142 km/h)
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-21
pr: 299
---

## Why
The HUD, the warp card and the speed meter caption only speak mph (a grep for
`km/h|kmh|kph` in `src/` and `index.html` finds nothing). Almost every country measures road
speed in km/h; only the US, the UK and a few territories use mph
(https://en.wikipedia.org/wiki/Mile_per_hour). The 88 mph hook is the identity of the game,
so mph stays the default, but a player in Lagos or Jakarta reading "50 MPH" has no feel for
the number, and screen readers (0284) read it too. A unit setting keeps the hook intact: the
warp threshold stays 88 mph and the km/h view shows 142.

## What
`Settings → Units: MPH | KM/H`, stored in `SaveStore.data.units` (default `'mph'`, invariant
6 needs the default in the data object) and defaulted once from `navigator.language`
(`en-US`, `en-GB` stay mph; others km/h) without any network call. The speed number, the
unit caption, the warp card ("88 MPH" → "142 KM/H"), the meter's `aria-valuetext`, the
results top speed, and the 0284 speech use one helper `formatSpeed(mph)` in a tiny
dependency-free module. Main has ~1 kB of headroom: put the converter in a lazy chunk the
HUD reaches only when units is `kmh`; the default path adds no bytes to main. Leaderboard
payloads and share text keep mph (one canonical unit server-side).

## Acceptance criteria
- [x] Setting persists across reload and appears in Settings from the title and from pause
- [x] In KM/H: HUD speed, caption, warp card, results top speed and the meter's spoken value show km/h, rounded to whole numbers; 88 mph reads 142
- [x] The warp still triggers at 88 mph; no physics value changes
- [x] The leaderboard POST and share text are byte-identical in both units
- [x] Main startup JS does not grow in the default (MPH) path; budget test stays green
- [x] No text under 10px added; fits at 320 px

## Test plan
Unit test for `formatSpeed` (0, 88 → 142, 160 → 257, rounding). E2e `tests/e2e/units.spec.js`
toggles the setting, reads the HUD at a pinned `GameState.speed`, reloads, and asserts the
leaderboard request body has the same mph in both modes.

## Out of scope
Distance units (metres are already used), per-track unit variants, speed-camera props.
