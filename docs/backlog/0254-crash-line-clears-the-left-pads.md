---
id: 0254
title: On a phone the obstacle crash line never runs under the left-hand pads or the score popups
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-09
pr: 241
---

## Why
In a 390x844 phone race (2D, level 1, after about 14 s) the crash plate
"BLOCKED! HOLD DRIFT ... TO SLIDE UNDER!" was drawn across the screen at car height: its left end
ran under the camera/pause pads and the plate sat directly over a "+1500 ⚡1.88GW!" popup next
to the player car, so both were hard to read. Pillar 3 (readability): one announcement channel,
never two texts on top of each other. The popup layout rules (`src/popups.js`, 0114) stack labels
above the roofline and clamp them to the canvas, but the shatter label from
`spawnObstacleShatter` (`src/race-specials.js`) is placed by itself and ignores both the pads
and the popups.

## What
Route the shatter label's position through the same layout as the popups (or clamp it to the
free band between the left pad column and the right action arc, and stack it clear of the
popups). Use the measured overlay slots in `src/layout.js` / `hudRects()` for the pad rectangles
rather than new magic numbers. Touch only the label placement, not its text (0253 owns the words).

## Acceptance criteria
- [ ] At 390x844 and 844x390 the crash label's box overlaps no touch pad rectangle and no popup box
- [ ] At 1280x720 placement is unchanged or still overlap-free
- [ ] Label stays inside the canvas and keeps its 150 ms-style fade (no new motion; honours calm motion)
- [ ] No per-frame allocation added

## Test plan
Unit test for the placement function (pure: label width, pad rects, popup rects in, box out)
asserting no overlap for the phone portrait/landscape pad layouts in `src/touch/layouts.js`.
Add one e2e screenshot assertion in the existing overlap spec (`tests/e2e/zero-overlaps` style)
that triggers a gate crash and checks the rects.

## Out of scope
Rewording the line (0253), the chain plate, any HUD redesign.
