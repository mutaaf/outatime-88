---
id: 0248
title: Landscape phone start-lights card shrinks so the road and car stay visible at GO
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-05
pr:
---

## Why
Scout play-through at 844x390 (iPhone 13 landscape context, headless Chromium, 0.6 s after
GO): the `#rcLights` card (three green lamps, the huge "GO!" and the launch prompt) measures
437x163 px in a 750x342 viewport, 58% of the width and 48% of the height, centred on the
lower half of the screen. It hides the player's car, the lane band and the traffic just ahead
(a box truck was drawn behind the card edge) while the car is already moving. 0225 cleared
the coach card and 0215 the portrait grid banners; this card is the one big overlay on
landscape phones nobody has sized. Pillar 3: at speed the player must parse the screen in a
glance; the start is the moment the player most needs to see the road.

## What
On viewports shorter than 480 px tall, lay `#rcLights` out compactly: lamps in a single
small row and "GO!" at a modest size, with the launch prompt as one short line, docked in the
upper-middle gap between the HUD cards (above the road horizon), not centred over the lane
band. Desktop (1280x720) and portrait are unchanged. Touches `src/styles.css` (and the
card's markup only if needed); no change to timing, wording or rocket-start logic.

## Acceptance criteria
- [ ] At 844x390, while `#rcLights` is visible, its box does not intersect the lane band (road centre +/-25% of the view width, from the horizon down) or `GameState.carBox`
- [ ] The card is at most 35% of the viewport height at 844x390 and 667x375
- [ ] Lamps, GO! and the launch prompt are all still visible and unclipped (no ellipsis cut of the prompt)
- [ ] 1280x720 and 390x844 card boxes are unchanged (+/-1 px)
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
New small spec `tests/e2e/lights-card-landscape.spec.js` (own file, see LESSONS 2026-10-31):
at 844x390 and 667x375 start a race from the lineup, poll `#rcLights` in one
`waitForFunction` (raf) until visible and return its rect plus `GameState.carBox`; assert
no intersection with the lane band and car, and height <= 35% of the viewport. At 1280x720
assert the rect is the same as measured on main. Fails on main (card is 48% tall, over the car).

## Out of scope
Changing the lineup/start sequence timing, the rocket-start window, or the desktop card.
