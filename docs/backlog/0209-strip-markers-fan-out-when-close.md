---
id: 0209
title: Track-strip markers fan out instead of stacking when cars are close
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-23
pr:
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

## Acceptance criteria
- [ ] A pure function returns a row offset (0, -1, +1) per marker; no two markers' boxes overlap for any set of up to 7 progress values
- [ ] YOU keeps offset 0 and the highest z-index
- [ ] Offset changes only when the overlap set changes (no per-frame DOM writes when nothing moves)
- [ ] Markers stay inside the strip's container and clear of other HUD blocks at 1280x720 and 390x844
- [ ] No per-frame allocation in the layout function (reuse an array)

## Test plan
Unit: clustered, evenly spaced, identical progress, and YOU-among-rivals cases assert no box
overlap and YOU offset 0. E2E (extend `tests/e2e/strip-marks.spec.js`): force three rivals
to the same progress via the debug hook and assert pairwise non-overlapping bounding boxes.

## Out of scope
Changing label text, colours or the gap pills.
