---
id: 0226
title: Landscape phone title stacks four buttons over the hero car
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-30
pr:
---

## Why
Scout play-through at 844x390: PLAY, RACE FRIENDS, TILT STEERING and VIEW 2D/3D fill the
centre in a column, so the hero car (the title's attitude, pillar 1) is completely hidden
behind the buttons; only the arch and billboards show. 0208 fixed laptop-height windows, but
landscape phones (≤ 430 px tall) were never measured. The car should be the star of the first
frame on the platform that ships first.

## What
For viewports ≤ 430 px tall, lay the secondary controls (RACE FRIENDS, TILT, VIEW) in one row
beside or under PLAY and shrink the wordmark so that `GameState.carBox` is at least 70%
unobstructed by title buttons. Touch targets stay ≥ 44 px. Touches `src/home.css` / `src/styles.css`.

## Acceptance criteria
- [ ] At 844x390 and 740x360 at most 30% of `carBox` is covered by a title button or chip
- [ ] Every title control stays on screen, ≥ 44x44 px, with no overlaps (existing overlap check)
- [ ] 390x844 and 1280x720 title unchanged (pixel-position asserts from 0208 still pass)

## Test plan
Extend the title layout e2e (see 0208) with the two landscape sizes: intersect button rects with `carBox`.

## Out of scope
New title art or copy.
