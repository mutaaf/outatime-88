---
id: 0241
title: Two cars hit in the same instant show one impact label, not two stacked copies
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-01
pr: 216
---

## Why
Pillar 3: never two texts on top of each other. 0220 made different label kinds share one lane,
but identical ones still double up: in a scout play-through at 390x844 (a heavy crash through
two cars) "💥 SOLID TRAFFIC IMPACT!" was drawn twice, a few pixels apart, so the text read as a
smeared double image just above the car. Each contact calls `spawnObstacleShatter(..., '💥 SOLID
TRAFFIC IMPACT!')` (`src/race-step.js`, traffic collision branch) with its own label, so two
contacts within one step produce two plates.

## What
In the same hit-label slot code 0220 added, treat a new label whose text equals a live label's
text (created within the last ~400 ms) as a repeat: do not add a second plate; refresh the live
one's timer and, if a count is shown at all, append "×2". Damage, shatter particles, sound and
score are unchanged (only the text plate is merged). Keep main-bundle growth at zero (reuse the
existing helper, see docs/LESSONS.md on headroom).

## Acceptance criteria
- [ ] Two same-text hit labels spawned within 400 ms yield exactly one live plate
- [ ] A different text (pickup, takedown) still stacks per 0220's rule
- [ ] Same text more than 400 ms apart still shows a fresh plate
- [ ] Damage and particle counts for the two hits are identical to before

## Test plan
Unit test on the slot helper (feed two identical labels at t=0 and t=0.1 s, then t=0.6 s) in
its existing test file; no new e2e needed. Run `npm run check:fast`.

## Out of scope
Merging different labels; changing label wording or style.
