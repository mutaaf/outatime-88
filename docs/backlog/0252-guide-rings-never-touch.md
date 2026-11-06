---
id: 0252
title: First-race thumb guide — the WARP and NOS pulse rings never overlap each other
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-06
pr: 238
---

## Why
Playing the first race at 390x844 touch (iPhone 13 profile, 2026-11-06, start grid,
0 mph) the guide's pulsing rings around NOS (amber) and WARP (cyan) intersect: the two
rings are each the pad diameter + 18 px (`ring()` in `src/touch/panel.js`), and the pads sit
close enough that the amber ring runs through the cyan one, with the "WARP" bubble's
leader line crossing both. Two glowing circles fighting for the same pixels make it unclear
which pad is being taught: pillar 3 (readability, clutter is a bug). 0166 and 0225 keep the
*bubbles* off the pads; nothing yet checks the *rings*.

## What
In the guide layout (`src/touch/panel.js`, around the `ring(...)` calls and the spot list at
~line 213, plus `.tc-guide-ring` CSS in the touch stylesheet): size each ring from the
smaller of "pad diameter + 18" and the free gap to the nearest other ring/pad, so no two
rings intersect and a ring never covers another pad's centre. Keep the pulse and colours.
If even the minimum ring (pad diameter + 4) would still collide at some size, show the
rings one at a time (WARP first, as the guide already orders its bubbles).

## Acceptance criteria
- [x] At 390x844, 844x390 and 768x1024 no two `.tc-guide-ring` boxes intersect (circle test, centre distance >= sum of radii)
- [x] A ring never contains another pad's centre
- [x] Rings still pulse around WARP and NOS and clear when the guide ends, as today
- [x] No frame-time regression (rings are CSS only)

## Test plan
Extend `tests/e2e/touch-layouts.spec.js` next to the 0166 bubble test: fresh save per
viewport, read ring and pad bounding boxes while the guide shows, assert the circle and
centre conditions. Prove it bites by temporarily widening the ring padding.

## Out of scope
Coach copy, bubble placement (0166), the order tips appear in, desktop (no rings).
