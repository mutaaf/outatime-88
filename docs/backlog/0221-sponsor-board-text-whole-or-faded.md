---
id: 0221
title: A roadside sponsor board never shows half its text at the screen edge
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-28
pr:
---

## Why
In the 1280x720 level-1 play-through a first-party "MORE FREE GAMES" board slid in from the
left edge at ~80 mph, huge and clipped: the headline read "TAAFAZIZ.COM" (the leading "MU"
cut off) and its right half dominated a fifth of the screen. A cropped brand name looks like
a bug rather than scenery, and a large bright slab at the edge competes with the lane for
attention. 0203 stopped boards hiding traffic; this covers boards hiding their own text.

## What
When a board's projected rect crosses the canvas edge, fade its alpha with the clipped
fraction (full at 0 %, ~0 at 40 % outside) or shrink its text to fit the visible part, and
cap board width at 28 % of the canvas. Touches the 2D board draw in `src/scenes/` or the
sponsor-board module (find with `grep -rn "MORE FREE GAMES" src`). No new hosts or assets
(see docs/ADS.md).

## Acceptance criteria
- [ ] A pure `edgeFade(rect, canvasW)` helper returns 1 inside, falls to ≤0.1 at 40 % clipped (unit test)
- [ ] Probe: no board with >15 % of its width outside the canvas has alpha above 0.6, at 390x844 and 1280x720
- [ ] Board width ≤ 28 % of canvas at both sizes
- [ ] Zero overlaps and the console guard still pass; frame-time probe within budget

## Test plan
Unit test for the helper; a short e2e drive on level 1 sampling board rects through the
`?debug` hook.

## Out of scope
Board copy, campaigns, or reporting.
