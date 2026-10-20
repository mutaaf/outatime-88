---
id: 0166
title: Phone coach bubbles must not clip off-screen or cover the buttons they teach
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-19
pr: 133
---

## Why
Playing level 1 at 390x844 touch (2026-10-19 screenshot, countdown) the first-run bubbles
"HOLD = NOS" and "WARP" sit on top of the NOS and WARP pads, and the WARP bubble runs off
the right edge of the screen. The teaching text hides the very controls it explains and is
cut off. Pillar 3 (readability): clutter is a bug.

## What
Anchor each coach bubble beside its pad (above or to the inner side), clamp it inside the
safe-area viewport, and drop it if there is no room. Touches the touch coach/onboarding
layout (`src/onboarding.js`, `src/touch/`, CSS) only.

## Acceptance criteria
- [x] At 390x844, 844x390 and 768x1024 every visible coach bubble lies fully inside the viewport and overlaps no pad's bounding box by more than 0
- [x] Bubbles still show once, in the same order, and still clear on use
- [x] Zero-overlap layout e2e still green at all viewports

## Test plan
Extend `tests/e2e/touch-layouts.spec.js`: start a race with a fresh save per viewport, collect bubble and pad bounding boxes, assert containment and no intersection.

## Out of scope
Changing the coach copy or the order in which tips appear.
