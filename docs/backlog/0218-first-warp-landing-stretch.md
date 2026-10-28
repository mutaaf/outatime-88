---
id: 0218
title: The first warp of a run lands on a short authored stretch before the road goes procedural
status: ready
priority: P2
size: M
lens: player-feel
created: 2026-10-28
pr:
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
- [ ] Unit: the authored segments are continuous with the road before and after (existing `track.test.js` invariants hold)
- [ ] Unit: inserted once per run, only after the first warp, never when `GameState` is a live room or daily
- [ ] Every lane stays open: no obstacle placed inside the authored stretch
- [ ] Screenshots at 1280x720 and 390x844 attached to the PR
- [ ] Reduced motion adds no flashes; player keeps control throughout

## Test plan
`tests/unit/track.test.js` invariants plus an e2e that warps via `__OT` and asserts the stretch length.

## Out of scope
Other eras, cutscenes, anything that takes control from the player.
