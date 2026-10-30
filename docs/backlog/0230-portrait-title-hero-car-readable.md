---
id: 0230
title: Portrait phone title: the hero car is a thumbnail under four stacked buttons
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-30
pr:
---

## Why
Scout play-through at 390x844: the title's car is ~60 px wide at the bottom edge while PLAY,
RACE FRIENDS, TILT and VIEW and the three-line pitch stack across the road behind it. Pillar 1
asks for a title with attitude, and 0226 already gave landscape phones a hero car that is the
star. Portrait phones are the first screen most players see.

## What
On portrait phones lift the hero car to occupy the lower ~30% of the screen at ≥ 40% of the
width (the scale rule in LESSONS 2026-10-26 is 36.5vw on laptops), moving the pitch lines and
the TILT / VIEW chips into one row above the bottom icon row. Touch targets stay ≥ 44 px.

## Acceptance criteria
- [ ] At 390x844 and 360x640, `GameState.carBox` width ≥ 38% of the viewport and ≤ 30% of it is covered by title text/controls (same measure as the 0226 landscape check).
- [ ] All controls on screen, ≥ 44 px, no overlaps, no scroll; 1280x720 and landscape titles unchanged.
- [ ] A returning player and a first visit (pitch lines) both pass; challenge banner case included.

## Test plan
Extend the "landscape phone title" test in tests/e2e/title.spec.js with portrait sizes using
the same carBox cover measure. Fails on main.

## Out of scope
New title art; the home hooks' content (0185).
