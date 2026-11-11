---
id: 0265
title: The "THUMB HERE TO STEER" pill never covers the left-edge touch button
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-11
pr: 256
---

## Why
Play-through at 390x844 (touch, Endless, ~14 s in): `#steerHint` sits at left 8, top 658,
198x33 px and overlaps the 48 px round button `#tcPause` at left 14, top 650, so half of that
button is hidden behind the orange pill and the player can't tell what it is or tap it
cleanly. 0243 kept the hint off the score plates and 0254 kept the crash line off the left
pads, but the steer hint was never checked against the pad buttons. Pillar 3 (readability) and
pillar 6 (phone is first-class). Guidance: Apple's game-controls HUD guidance and Xbox XAG 107
both ask that on-screen controls stay large and unobstructed:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/107

## What
Place `#steerHint` (src/touch or wherever it is positioned; grep `steerHint`) so its rect never
intersects any visible `.tc-*`/touch button rect, at 390x844, 360x640 and landscape phones. If
space is short, shift it above the stick zone or shorten it; keep it hidden once the player has
steered (existing behaviour).

## Acceptance criteria
- [x] With the hint visible, its bounding rect intersects no visible touch button (`#tcPause` and the left pad stack) at 390x844, 360x640, 844x390
- [x] Hint text is still fully visible (not clipped) and still hides after first steer
- [x] Desktop (1280x720) unchanged; no console errors

## Test plan
e2e on touch contexts: start a race, wait for `#steerHint` visible, assert no rect overlap with
every visible touch button, at the three viewports.

## Out of scope
Redesigning the touch layout or the hint copy.
