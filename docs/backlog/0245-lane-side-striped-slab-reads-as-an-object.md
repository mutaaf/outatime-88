---
id: 0245
title: The dark slab with a red-yellow-red stripe at the right road edge during the first seconds is either given a clear identity or faded like other near objects
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-04
pr:
---

## Why
In a scout play-through (level 1, about 1-6 s after the grid releases) a tall, flat navy
block with a bold red/yellow/red band stands at the right road edge in every viewport:
about x 1190-1280 and y 460-715 at 1280x720, behind the JUMP/NOS buttons at 844x390, and
at the right edge at 390x844 (screenshots from the scout run: desk-play9, land-play9).
It has no readable detail (no text, no wheels, no pole), so it reads as a wall or a render
bug rather than a prop, and at 844x390 it sits under the touch buttons. Readability is
pillar 3 in `AGENTS.md`: scenery that cannot be parsed in a glance is clutter. Reference:
[Game Accessibility Guidelines, "Use simple clear language / avoid visual clutter"](https://gameaccessibilityguidelines.com/).

## What
Find which prop draws this block (start with the roadside board/prop draw in
`src/billboards.js`, `src/billboard-art.js` and the traffic sprite path `src/car-sprite.js`;
reproduce with the debug hook at 1280x720 seed of the daily level, race time 4-7 s). Then
either (a) give it its real identity (a pole or legs plus a legible face, in the original
palette), or (b) apply the 0200/0203 near-object fade so it never covers more than ~8% of
the canvas width at full alpha. Render-only; no sim change.

## Acceptance criteria
- [ ] The object is identified in the PR body with the file and function that draws it
- [ ] At 1280x720, 390x844 and 844x390 no single roadside prop covers more than 8% of canvas width at full alpha (unit test on the helper plus e2e pixel-coverage probe)
- [ ] It no longer sits solid behind the phone action buttons at 844x390
- [ ] No frame-time regression (perf probe within budget); main JS budget unchanged

## Test plan
Unit test for the scale/alpha helper (monotonic, bounds). E2E at the three viewports
advances the race to the frame where the block appears and asserts coverage under the cap.

## Out of scope
Changing prop placement on the road, traffic spawning, or the 0244 strip fade.
