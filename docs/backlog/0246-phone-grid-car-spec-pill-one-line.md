---
id: 0246
title: Phone grid shows one short car line, not a two-line spec pill stacked under the level banner and above the lights card
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-04
pr: 228
---

## Why
At 390x844 (iPhone 13 emulation, touch, level 1) about 7 s after PLAY the grid shows four
text blocks at once: the level banner ("LVL 1: CLOCK HOLLOW 2026 3D"), a bordered pill reading
"'88 Flux Coupe Gull-Wing · ALL-ROUNDER · SPD 6 · ACC 6 · GRIP 6 · ARMOR 4" that wraps to two
lines and spans the full screen width, the lights card, and the HUD chips above them. Pillar 3
in `AGENTS.md` says one announcement channel and clutter is a bug; the stat line is garage
information the player cannot use while lights are counting down. Reference: Split/Second's
deliberately stripped HUD (lap, position, one meter), as summarised in
[MTV News on Split/Second's HUD](https://www.mtv.com/news/2459097/splitseconds-simple-hud/).

## What
In `src/racestage.js` (the `rc-mycar` span, ~line 130) and `src/styles.css` (`.rc-mycar`,
~line 738) show only `CAR NAME · CLASS` on viewports under ~600 px wide (the spec line stays
on desktop and in the garage). It must fit on one line (ellipsis on the car name if needed).

## Acceptance criteria
- [x] At 390x844 the `.rc-mycar` pill is a single line (height under 1.6 line-heights) and has no SPD/ACC/GRIP/ARMOR text
- [x] At 1280x720 the pill is unchanged
- [x] The pill never overlaps the lights card or the level banner at 390x844, 844x390 and 1280x720
- [x] Works with touch and keyboard; no frame-time regression

## Test plan
Add an e2e in a new small spec file that starts level 1 at the three viewports, waits for the
grid, and asserts the pill text and its bounding box against the banner and card rects.

## Out of scope
The garage spec bars, the line-up chips, and the lights card layout.
