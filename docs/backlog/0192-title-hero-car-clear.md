---
id: 0192
title: Title screen — keep the hero car clear of the big grey vehicle slab
status: shipped
priority: P1
size: S
lens: content
created: 2026-10-20
pr:
---

## Why
On the 1280x720 title (pillar 1, "a title screen with attitude") a large grey body panel
fills the right third and sits behind the hero car, so the car under PLAY reads as a dim
silhouette instead of the star. First impression matters most for a five-minute game.

## What
Verify what that panel is (a title-scene traffic/prop vehicle drifting into frame) and
keep scenery or traffic out of the hero car's framing, for example by spawn lanes and a
camera-safe zone in the title scene. Touches the title scene code only.

## Acceptance criteria
- [x] Across 20 seeded title loads at 1280x720 and 390x844, no prop/vehicle covers more than 15% of the screen area to the right of the hero car (a unit test on the spawn rule)
- [x] Screenshots at both sizes attached to the PR
- [x] Reduced motion keeps the same framing

## Test plan
Unit test on the spawn/keep-out rule; a title e2e screenshot (not pixel-diffed).

## Out of scope
New title art or copy.
