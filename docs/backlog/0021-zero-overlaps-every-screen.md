---
id: 0021
title: Zero overlaps on every screen shape — compact HUD for phones in both orientations
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-17
pr: 14
---

## Why
Operator: "no more overlaps on mobile". Measured on 2026-10-17: landscape phones (844x390)
stacked all three HUD panels over the road with the tip card on top of the score; 360x640
pushed the WARP pad off the right edge; the iPad portrait tip sat on the HUD; the coach
cross-faded on top of the fading level intro.

## What
- `src/layout.js`: pure `hudMode(w, h)` (compact ≤900 wide or ≤520 tall) and
  `overlaySlots()`; `watchLayout()` sets `<html data-hud>` and the message/telemetry/fork
  slot variables from the measured HUD and controls (resize, rotation, HUD size changes).
- Touch controls rebuilt as icon pads (DRIFT / JUMP / WARP) that scale with the screen;
  driver badge only on the full HUD; safe-area insets on every edge.
- Coach waits for the announcer's fade-out before taking the shared message lane.

## Acceptance criteria
- [x] e2e: at 390x844, 360x640, 430x932, 844x390, 768x1024, 1024x768 and 1280x720 no HUD
      panel, floating message or control overlaps another or leaves the viewport
- [x] Every touch pad is ≥44px at every size
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/layout.test.js` (mode + slot math), `tests/e2e/layout.spec.js` (box intersections
at seven viewports with every overlay forced visible).

## Out of scope
Title screen redesign (0022).
