---
id: 0243
title: Portrait phone: the "THUMB HERE TO STEER" prompt never sits on the score plates
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-02
pr:
---

## Why
Scout play-through at 390x844 (touch, fresh save, ~6 s after PLAY, 100 mph): the first-run
steer prompt (`#steerHint`, index.html: "👍 THUMB HERE TO STEER") is a pill at about
x 8-178, y 657-690, and the dodge-chain plates ("+1800 🔥 x6", then "x7") are drawn just above
the car at x 138-230, y 625-675. The pill covers the left end of the plate stack, so the
newest plate reads "x7" with its label under the prompt. That is two texts on the same
pixels in the busiest second of the run, the exact thing pillar 3 forbids; 0220/0228 made
plates, impacts and coach cards take turns but not this prompt. Touch-target and overlap
guidance: https://gameaccessibilityguidelines.com/ (large, well spaced virtual controls and
readable feedback on small touch screens).

## What
While `#steerHint` is visible, the plates' layout treats its measured rect as an exclusion
zone (like the car box) so plates shift clear of it; or, if there is no room, the hint fades
the moment a plate is live and returns after the plates settle (it only ever shows once per
run in any case). Pick whichever costs fewer bytes in the lazy popups/chain-plate code; main's
startup bundle must not grow (see AGENTS.md § Commands budgets).

## Acceptance criteria
- [ ] At 390x844 first race, a forced dodge chain while `#steerHint` is up never leaves a plate rect intersecting the hint's rect (e2e reads both)
- [ ] Same check at 844x390 and 1280x720 (desktop shows the keys hint; no regression)
- [ ] Plates still inside the canvas and clear of the car box (0114/0220 tests stay green)
- [ ] Calm motion unchanged; no per-frame allocation added

## Test plan
Unit test for the exclusion in the popups layout (pure). E2E via the `?debug` hook in a
small new spec file (see LESSONS 2026-10-31: do not append to big specs): start a first
race, force a chain of takedowns, assert the plate rects and `#steerHint` rect never overlap.

## Out of scope
Rewording or retiming the hint itself; the thumb guide's bubbles (0228).
