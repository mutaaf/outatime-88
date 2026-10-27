---
id: 0209
title: Track-strip markers fan out instead of stacking when cars are close
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-23
pr: 172
---

## Why
Scout playthrough at 390x844 (2026-10-23): on the race strip the K rival marker sat on top of
the YOU tag, and at 1280x720 the R and C markers overlapped into one blob. Ticket 0167 made
each marker carry a letter, but two markers within a few pixels still hide each other, which
is exactly when the player most needs to read the strip (a pack fight). Clutter is a bug
(pillar 3).

## What
In the strip layout (the lazy `src/strip-marks.js` / race HUD writer in `src/hud.js`), when
two markers' centres are closer than one marker width, nudge the lower-ranked ones
vertically (alternating above/below the strip line, max two rows) so every letter stays
readable. YOU is never moved and always drawn on top. Positions still map to progress
exactly; only the vertical offset changes. Honours change-only DOM writes.

**What shipped (builder, 2026-10-27): the pack fans out sideways, not into rows.** Measured at
race time, the strip has only 6 px clear above and below it on phones in portrait (the place /
time / speed cards sit right above it, the coach card and announcer 6 px below), and a rival
marker is 14 px tall against a 22 px strip with an 18 px YOU tag on the line. Three rows need
~46 px, so vertical rows would cover other HUD blocks or each other there. Instead
`fanOut()` (src/strip-marks.js, in the lazy race-flow chunk) keeps YOU at its exact spot and
pushes the cars ahead of you right and the cars behind you left, just far enough that no two
boxes touch, so a pack reads in race order with every letter showing. A marker clear of its
neighbours keeps its exact spot; a pack against the flag or the start line packs back towards
YOU inside the strip. With no room left on one side (YOU a car-length from the flag while three
rivals have finished), those markers stay on their side of YOU, under its tag, never ahead of
it in the wrong order. Marker widths reach it through a ResizeObserver, so the HUD still never
reads layout.

## Acceptance criteria
- [x] A pure function lays out every marker; no two boxes overlap for any set of up to 7 progress values whenever the strip has room for them on their side of YOU (unit: identical progress for the whole field with YOU at every rank, the grid, a pack at the flag, 3000 random fields)
- [x] YOU keeps its exact spot and the highest z-index
- [x] `left` is written only when it changes (no per-frame DOM writes when nothing moves)
- [x] Markers stay inside the strip's container and clear of other HUD blocks at 1280x720, 390x844 and 320x568 (e2e: three rivals level a few metres ahead of you and one on top of you)
- [x] No per-frame allocation in the layout function (reused arrays)

## Test plan
Unit (tests/unit/strip-fan.test.js): clustered, evenly spaced, identical progress, and YOU-among-rivals cases assert no box
overlap and YOU offset 0. E2E (extend `tests/e2e/strip-marks.spec.js`): force three rivals
to the same progress via the debug hook and assert pairwise non-overlapping bounding boxes.

## Out of scope
Changing label text, colours or the gap pills.
