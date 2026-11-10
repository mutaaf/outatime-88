---
id: 0260
title: Portrait phone start-lights card shrinks so the road and horizon stay in view at GO
status: ready
priority: P2
size: M
lens: player-feel
created: 2026-11-10
pr:
---

## Why
At 390x844 the start-lights card is ~355x175 px: three lights, the 3/GO digit and a two-line
rocket-start prompt, parked over the horizon and the era backdrop (screenshot at GO still shows
the full card while the field pulls away). Landscape phones got a slim row in 0248; portrait
still spends a fifth of the screen on a ceremony whose launch prompt is repeated by the touch
WARP pad's glowing ring. Pillar 3 (readability) and pillar 2 (the start should feel fast):
you should see the cars you are about to race, not a panel.

## What
In the portrait phone branch of the grid/lights CSS (`src/styles.css` near the 0257/0248 rules;
`src/racestage.js` if markup must change) cut the card: lights and digit on one row, prompt one
line (shorten the `touch` launch copy in `src/racecall.js` only if it cannot fit), card height
≤ ~110 px, still clear of the HUD, the SKIP pill (0257) and the touch pads. Fade the card out
over the first 0.4 s after GO rather than holding it. Desktop and landscape unchanged.

## Acceptance criteria
- [ ] At 390x844 and 430x932 the card is ≤ 120 px tall and overlaps no HUD slot, no pad and not the SKIP pill
- [ ] At GO the card is gone (opacity 0) within 0.5 s of the race clock
- [ ] The rocket-start prompt is still fully visible and ≥ 4.5:1 contrast during the lights
- [ ] Landscape phone and 1280x720 layouts are unchanged (existing grid e2e specs stay green)
- [ ] No frame-time regression

## Test plan
Extend the phone grid e2e (see tests/e2e touch-layouts / grid specs): sample the card box each
frame across the countdown at 390x844, assert height ≤ 120 px, no rect intersection with
`hudRects()` or the pads, and opacity 0 by 0.5 s after GO (wait on race clock, not wall clock).

## Out of scope
Landscape (0248), the SKIP pill (0257), lineup cards, the ceremony's timing or sounds.
