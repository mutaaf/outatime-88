---
id: 0194
title: The desktop tip card must not sit over the road ahead
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-20
pr: 135
---

## Why
Scout play-through at 1280x720 (level 1, first 10 s): the coach TIP card ("Draft the green wake behind rivals...") is a wide pill centred under the race clock, directly over the horizon, the sun and the rival truck the player is meant to read and draft. Phones got a slimmer tip in 0021, but desktop keeps the full card mid-screen. Readability (pillar 3): nothing should cover where traffic appears.

## What
Dock the desktop/tablet tip to a screen edge outside the road's vanishing region (for example bottom-left above the steer chip, or the top-left under the place panel), at most ~320 px wide, same copy, same once-only order. Touch behaviour is untouched (0166 owns phones). Touches `src/styles.css`, `src/layout.js` slots, and the tip element in `index.html`.

## Acceptance criteria
- [x] At 1280x720 and 1024x768 the tip's rect does not intersect the central 40% of the viewport width between y = 15% and y = 70%
- [x] The tip still shows once, in the same order, and clears on use or GOT IT
- [x] The zero-overlap layout e2e stays green at all viewports
- [x] No per-frame DOM writes added

## Test plan
Extend the layout e2e: start a race at 1280x720 and 1024x768, wait for a tip, assert its bounding box against the centre band and the HUD rects (`hudRects()`).

## Out of scope
Phone tips (0166), tip copy and ordering.
