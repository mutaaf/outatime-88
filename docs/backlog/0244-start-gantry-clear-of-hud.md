---
id: 0244
title: The start-grid gantry board stays below the HUD strip instead of running behind the timer and progress bar
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-03
pr: 224
---

## Why
At 1280x720 on the grid of level 1 (about 4 s after PLAY, while the line-up card is up),
the DAILY CHALLENGE gantry board stands right over the car and fills the top of the screen.
Its huge "A NEW ROAD EVERY DAY" line and the clock face run straight behind the progress
bar, the gap pill and the 0:00.0 timer, so the HUD chips sit on busy cream-and-red lettering
(the strip is hard to read for the first seconds). Readability is pillar 3 in `AGENTS.md`:
the HUD strip is where the player looks for position, gap and time, and scenery should not
compete with it. Reference: HUD legibility guidance in
[Game Accessibility Guidelines, "Ensure text is readable"](https://gameaccessibilityguidelines.com/ensure-that-all-text-is-readable-and-clear/).

## What
In the 2D board draw path (`src/billboards.js`, `src/billboard-art.js`) clamp the screen-space
top of a gantry/arch board that is nearer than a set distance so it never rises above the HUD
strip's bottom edge (reuse the HUD strip height already measured for the fork cards, 0242),
or fade its alpha to ~0.5 where it overlaps the strip, as 0203 does for traffic. No new art
and no change to board placement on the road.

## Acceptance criteria
- [ ] With a board under the camera, no board pixel is drawn inside the HUD strip rect at full alpha (unit test on the clamp/alpha helper)
- [ ] Screenshot at 1280x720 on the level 1 grid shows the progress bar, gap pill and timer on plain sky/dim backdrop
- [ ] Same check at 390x844 touch and 844x390 landscape; boards farther away are unchanged
- [ ] No frame-time regression (perf probe within budget) and main/chunk budgets respected (see LESSONS)

## Test plan
Unit test the helper with a board rect above, straddling and below the strip. One small
e2e spec file of its own (see LESSONS on flake guard) that starts level 1, waits for the grid,
and asserts through the draw-decision hook that the board alpha over the strip is below 1.

## Out of scope
Board art, sponsor content, or any in-race (post-grid) board behaviour beyond the strip.
