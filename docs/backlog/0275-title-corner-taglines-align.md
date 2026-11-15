---
id: 0275
title: Desktop title - the three corner taglines line up on one baseline row and stay off the hero car
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-15
pr: 271
---

## Why
Scout run 2026-11-15, 1280x720 title screenshot: "RACE THROUGH TIME. / LEVEL UP FOREVER." sit
bottom-left at two different heights, "DODGE · DRIFT · JUMP." floats lower-right at a third
height, and the lightning orb badge crowds the left of the hero car. The three lines read as
scattered, not as one deliberate lock-up. Original identity pillar: the title is the first
impression, so it should look composed.

## What
In the title layout (`index.html` / title CSS, `src/ui` title code) place the taglines on one
shared baseline band above the bottom icon row (left group, right group at equal y), with a
min gap to the hero car's screen rect. Keep text contrast >= 4.5:1 and the 10px floor (0268).

## Acceptance criteria
- [ ] At 1280x720 and 1920x1080 the left and right tagline groups share the same baseline y (within 2px)
- [ ] No tagline rect intersects the hero car or the orb badge rect
- [ ] Phone portrait and landscape titles unchanged (existing touch-layout specs green)
- [ ] Contrast and font-size floors still pass

## Test plan
Extend the title layout e2e (rect comparisons, as in 0208/0230) and attach before/after
screenshots at the desktop sizes.

## Out of scope
Changing tagline copy, the logo, or the PLAY ribbon.
