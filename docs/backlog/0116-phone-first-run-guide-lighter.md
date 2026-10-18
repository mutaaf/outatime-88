---
id: 0116
title: Phone first run — the thumb guide shouldn't blank the road before the first race
status: in-progress
priority: P2
size: S
lens: player-feel
created: 2026-10-18
pr:
---

## Why
Pillar 6 and the one-tap title promise (0022). At 390x844 the first race opens behind a
full-screen dim with two big tutorial cards and a GOT IT button; the road, rivals and HUD are
barely visible and a player must read two paragraphs before touching anything. Kids with five
minutes want to drive. The race itself already teaches steering (onboarding steer prompt).

## What
Shrink the first-run thumb guide to a non-blocking hint (outlined zones plus one line each)
that fades when the first touch lands, instead of a modal that needs GOT IT. Touches
`src/touch/` guide code only.

## Acceptance criteria
- [x] At 390x844 the road and HUD stay visible (dim ≤ 25%) while the guide shows
- [x] First touch dismisses it; it never shows again after that
- [x] The race does not start its clock until the lights, as today

## Test plan
Extend the touch e2e: first-run guide visible, no GOT IT tap required, dismissed by a touch.

## Out of scope
Controls panel and layout editor.

## Shipped
With 0140: the guide now plays over the start lights with no dim and no tap target
(`pointer-events: none`), a ghost thumb swiping the steering zone plus WARP / HOLD = NOS rings,
and fades once you steer (or 3 s into the race). The race is never paused for it.
