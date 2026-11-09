---
id: 0255
title: The floating damage label ("-15 HP") meets 4.5:1 contrast over the sky
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-09
pr:
---

## Why
On the 1280x720 race screenshot a faint "-15 HP" label sits just under the place card
(top-left, about y=133) in thin grey text with no plate, over a purple night sky: it is
close to unreadable, yet it is the one place that tells you what a hit cost. Invariant 8:
text meets 4.5:1 on HUD backgrounds (WCAG 1.4.3, https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## What
Find where the damage readout is drawn (grep `HP` in `src/hud.js` / `src/race-step.js` /
`src/pickup-art.js`), give it the same dark plate and bright text treatment the other popups
use (`src/popups.js` / `pickup-art.js`), keep its position and fade, and keep reduced-motion behaviour.

## Acceptance criteria
- [ ] Label text vs its plate is ≥ 4.5:1 (unit-asserted from the colour constants)
- [ ] It no longer sits unplated on the raw sky; screenshot at 1280x720 and 390x844 checked
- [ ] No overlap with the place card or other HUD (`hudRects()` check) and no new console errors

## Test plan
Unit test computing the contrast ratio of the label's text/plate constants; extend the existing
HUD overlap e2e to include the label rect when visible.

## Out of scope
Changing damage numbers or the HP model.
