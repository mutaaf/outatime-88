---
id: 0009
title: Juice pack — speed lines, FOV kick toward 88, chromatic warp, crash slow-mo, near-miss hit-stop
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-16
pr: 5
---

## Why
Pillar 2. At 120 mph the screen looks almost the same as at 40: the road scrolls but nothing
*sells* speed or impact. Speed lines, a subtle field-of-view widening as you approach 88, a
chromatic split on the warp and a few frames of hit-stop on near-misses are the classic
arcade-racer feel multipliers (see Jan Willem Nijman's "The art of screenshake" talk and
Vlambeer's juice techniques).

## What
A new `src/fx.js` module with pure, testable functions: `speedFeel(speed)` → {lineCount,
lineAlpha, fovScale, shakeAmp}; `hitStop` timer; a fixed-size particle pool (no per-frame
allocation) for sparks/debris. Wire into `updateGame` and `renderScene`. Everything scales
to zero under `prefers-reduced-motion` (ticket 0003 provides the flag).

## Acceptance criteria
- [ ] Unit tests: `speedFeel` is monotonic in speed, zero below 40 mph, capped at 1.0 effects at ≥ 88; reduced-motion returns zero shake and zero lines
- [ ] Particle pool never grows past its capacity (unit test)
- [ ] e2e: at speed, the canvas shows speed-line pixels in the outer 15% band that are absent at a standstill
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/unit/fx.test.js` for the pure functions and pool; extend `tests/e2e/smoke.spec.js` with
an edge-band pixel comparison.

## Out of scope
New car models or tracks.
