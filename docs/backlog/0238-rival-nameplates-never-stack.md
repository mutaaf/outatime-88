---
id: 0238
title: Distant rival nameplates never stack on each other or on the lane ahead
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-01
pr: 212
---

## Why
At 1280x720 in the first seconds of a six-car race, the rival tags KAI, VEX, CAL, RIN and
DEZ pile up in a column at the road's vanishing point, directly over the pickup ring and the
NEAR MISS popup. The names are unreadable there and they hide what is in the lane ahead.
0019 declutter covered fork banners and early plates; the pack-bunched case is still messy.
Readability of overlapping text is the point of WCAG 2.2 SC 1.4.12 / 1.4.10 guidance
(https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): text in a HUD should not
lose or cover other content.

## What
In the nameplate draw (find with `grep -ril nameplate src/`), sort the visible plates by
distance, show only the nearest N (3) and any plate that is the player's immediate rival,
nudge or drop a plate whose rect overlaps an already placed plate or the lane-ahead pickup
box, and fade plates in and out over about 150 ms so none pops. Compute once per frame into
a preallocated array.

## Acceptance criteria
- [ ] With six cars bunched, no two drawn plates overlap and no plate sits over a pickup within 20 segments (unit test over the layout function)
- [ ] The rival directly ahead and the one directly behind always keep a plate
- [ ] Works at 390x844 and 1280x720; no per-frame allocation

## Test plan
A pure layout function with a unit test (bunched, spread, single car); e2e screenshot at
1280x720 counting overlapping plate rects via the existing debug hook.

## Out of scope
Changing the strip or the rank pills (0209, 0167).
