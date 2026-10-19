---
id: 0167
title: Race strip and line-up never rely on colour alone to tell rivals apart
status: proposed
priority: P2
size: S
lens: accessibility
created: 2026-10-19
pr:
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
- [ ] Every strip marker has a distinguishing initial or shape readable with colour removed (grayscale screenshot test)
- [ ] Markers never overlap labels at 390x844 and 1280x720
- [ ] No frame-time regression

## Test plan
e2e: start a race, read marker text via the DOM/canvas data hook and assert uniqueness; unit test for the label chooser.

## Out of scope
A full colour-blind palette mode.
