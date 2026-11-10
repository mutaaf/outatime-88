---
id: 0256
title: The horizon haze band has no hard edge across the backdrop (phone and desktop)
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-10
pr:
---

## Why
Scout run 2026-11-10: in the first seconds of a race, a flat, lighter translucent band
sits across the lower backdrop (about y=390 of 844 on a 390x844 phone, y=330 of 720 at
1280x720). Its top edge is a straight line cutting through the clock tower, billboards
and skyline, so it reads as a pane of grey glass rather than atmospheric haze. Readability
pillar: a hard seam in the scenery is noise at 120 mph, and it dulls the era backdrops.
Speed-perception writing stresses that a sense of depth comes from a smooth distance
falloff, not flat overlays: https://starwarsgalacticracer.com/?p=2798

## What
Find where the horizon haze/fog is composited over the backdrop (render and backdrop code
in `src/`) and make it a vertical gradient that fades to zero alpha at its top edge, so no
single row changes luminance abruptly. Same colour and strength at the horizon line.

## Acceptance criteria
- [ ] In a race at 390x844 and 1280x720, the mean luminance of consecutive pixel rows
      across the backdrop (road excluded) never steps by more than 6 levels between rows
      in the band region.
- [ ] Every era backdrop passes the same check.
- [ ] Haze colour at the horizon line is unchanged (within 4 levels per channel).
- [ ] No frame-time regression (gradient is cached, not rebuilt per frame).

## Test plan
Extend `tests/e2e/backdrops.spec.js`: screenshot the backdrop strip per era at both
sizes and assert the row-to-row step bound. A unit test covers the gradient stops if the
gradient builder is a pure function.

## Out of scope
New backdrop art, changing fog distance, the road surface.
