---
id: 0225
title: Landscape phones show five overlays in the first seconds; the coach card hides the road and car
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-30
pr: 194
---

## Why
Scout play-through at 844x390 (landscape phone, headless Chromium, 3 s after PLAY): the coach
card ("Draft the green wake behind rivals for a slingshot" + GOT IT) spans the middle of the
screen over the road ahead and the roofs of the leading cars, while a "DRAG TO STEER" tip, a
"WARP" label, a "HOLD = NOS" label and the progress strip all show at once. On a 390 px-tall
screen that is most of the playfield. 0194 fixed the desktop card and 0215 the portrait grid;
landscape is the one shape neither covered. Pillar 3: clutter is a bug, one channel at a time.
Guidance on keeping tutorial text out of the playfield: https://gameaccessibilityguidelines.com/

## What
On touch viewports shorter than 480 px tall (landscape phones), dock the coach card as a slim
one-line chip at the top between the HUD cards (or hide it until the car is racing past the
lights), and show at most one of {coach card, DRAG TO STEER, HOLD = NOS, WARP label} at a time,
in that priority order, each for its existing duration. Desktop and portrait are unchanged.
Touches `src/styles.css` / `src/touch/` tip code and the coach card positioning.

## Acceptance criteria
- [ ] At 844x390, from lights-out to 10 s, the coach card never overlaps the lane band (road centre ±25% of the view) or `GameState.carBox`
- [ ] At most one coach/tip label is visible at a time (sampled every 250 ms)
- [ ] Every tip and the coach card is still shown at least once on a first race
- [ ] 390x844 and 1280x720 layouts unchanged; reduced motion: same sequencing, no fade

## Test plan
New `tests/e2e/landscape-tips.spec.js` sampling element rects and visibility at 844x390 and 740x360; assert the rules above; fails on main.

## Out of scope
Changing tip copy or the thumb-guide bubbles' content.
