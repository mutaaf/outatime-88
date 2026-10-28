---
id: 0218
title: The first warp of a run lands on a short authored stretch before the road goes procedural
status: shipped
priority: P2
size: M
lens: player-feel
created: 2026-10-28
pr: 185
---

## Why
Split from 0028. Every warp lands on more of the same road, so the climax has no place to land. One
authored stretch for one era proves the idea at reviewable size. Reference for authored
set pieces breaking up procedural flow: GDC talks on arcade racer pacing are a good lead, but the
design here is ours; keep it to our own invented districts and no film imagery (invariant 3.7).

## What
In `src/track.js`, after the first warp in a run, insert 6 to 8 authored segments for the 1985 night
district (a long gentle sweeper into a short straight lined with signs and a clear gap-free
lane), then resume the generator. Deterministic, endless mode and campaign alike, never in live
rooms or the daily (they must match for everyone). Other eras are separate tickets.

## Acceptance criteria
- [x] Unit: the authored segments are continuous with the road before and after (existing `track.test.js` invariants hold)
- [x] Unit: inserted once per run, only after the first warp, never when `GameState` is a live room or daily
- [x] Every lane stays open: no obstacle placed inside the authored stretch
- [x] Screenshots at 1280x720 and 390x844 attached to the PR
- [x] Reduced motion adds no flashes; player keeps control throughout

## Test plan
`tests/unit/track.test.js` invariants plus an e2e that warps via `__OT` and asserts the stretch length.

## Out of scope
Other eras, cutscenes, anything that takes control from the player.

## Notes (builder, 0218)
- "6 to 8 authored segments" is built as 7 authored road sections (`ARRIVALS[1985].rows` in
  `src/arrival.js`, 138 ring segments, ~8 s at 88 mph): 8 single 200-unit ring segments would be
  under half a second at warp speed.
- The road is built ~225 segments ahead of the car, so the stretch is the first road built after the
  warp (it arrives roughly 10 to 15 s after the tunnel at 88 mph), not a rewrite of road already on screen.
- It plays when the run's first warp lands in 1985 (levels 1 and 5); a first warp into another
  era uses up the run's arrival until those eras get their own stretches.
- The whole stretch is one `ARRIVAL` feature, so the set-piece rules keep obstacles, props, era
  spills and Endless hazards off it and traffic steps off it; no pickups. The signs are the era's
  own clock-tower boards (never sold), so no sponsor slot moves (docs/ADS.md).
