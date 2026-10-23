---
id: 0167
title: Race strip and line-up never rely on colour alone to tell rivals apart
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-10-19
pr: 158
---

## Why
The track strip at the top of the race HUD shows rivals as small coloured dots with no
label except YOU, and the line-up chips lean on a coloured edge. Colour-blind players
cannot tell who is who or who is closing. Game Accessibility Guidelines: do not rely on
colour alone to convey essential information
(https://gameaccessibilityguidelines.com/). Invariant 8 (accessibility floor).

## What
Give each strip marker its rival's initial (or a distinct shape) with a 4.5:1 contrast
outline, keep YOU larger, and make the nearest rival ahead/behind labelled. Touches
`src/hud.js` and the strip styles.

## Acceptance criteria
- [x] Every strip marker has a distinguishing initial or shape readable with colour removed (e2e: unique letters, ≥ 4.5:1 white-on-near-black text; grayscale screenshots checked by hand at 1280x720 and 390x844)
- [x] Markers never overlap labels at 390x844 and 1280x720 (e2e: inside the strip and clear of every other HUD block, 7 sizes 320–1920 px incl. landscape phone and tablet). Cars at the same spot (the grid, a tight pack, endless rivals clamped to an end) still stack on the strip: YOU and the ▲/▼ cars draw on top
- [x] No frame-time regression (HUD writes only on change; CI perf project)

## Test plan
e2e: start a race, read marker text via the DOM/canvas data hook and assert uniqueness; unit test for the label chooser.

## Out of scope
A full colour-blind palette mode.
