---
id: 0199
title: The live score pill never shows a negative number
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-21
pr: 142
---

## Why
Scout play-through (1280x720, holding throttle through traffic): the race HUD read
`-23,516 PTS` while the final score is defined as `max(0, earned - penalty)` in
`src/scoring.js`. A negative running total reads as a bug and contradicts the results card,
which never goes below zero. Players, mostly kids, should see a number that matches what
they will be paid. Game Accessibility Guidelines: keep text simple and clear
(https://gameaccessibilityguidelines.com/).

## What
In `src/hud.js` (line ~141) display `max(0, pts)`. When the raw value is below zero, add a
dim `PENALTY` tag in the same pill (no new element, no second announcement channel).
Single formatting helper, pure and unit-tested.

## Acceptance criteria
- [x] With earned < penalty the pill shows `0 PTS` and the tag, never a minus sign
- [x] Pill value equals the results-card final score at the finish
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse; pill does not widen or overlap `hudRects()`
- [x] No frame-time regression (change-only DOM writes kept)

## Test plan
Unit test for the formatter (negative, zero, large). E2E: force `GameState` score and penalty
so earned < penalty, assert the pill text has no `-`.

## Out of scope
Changing penalty values or the scoring rules the Worker recomputes.
