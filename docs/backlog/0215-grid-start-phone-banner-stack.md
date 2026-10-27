---
id: 0215
title: The phone start grid stacks four banners over the skyline; show one at a time
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-27
pr:
---

## Why
Scout play-through at 390x844 (headless Chromium, first seconds after PLAY): above the road
sit the progress strip, a six-chip lineup row (P1 DEZ ... P6 YOU) and a full-width car-stats
banner ("'88 Flux Coupe Gull-Wing · ALL-ROUNDER · SPD 6 · ACC 6 ..."), on top of the HUD
cards, a "DRAG TO STEER" tip and a "WARP" label near the thumb. That is about 40% of the
screen as text while the player is only waiting for the lights. Pillar 3 says clutter is a
bug, and one announcement channel at a time.

## What
During the pre-race grid on phone widths (< 480 px), show the lineup chips and the car-stats
banner one after the other (lineup first, then stats for ~1.5 s each, stats skipped on repeat
races of the same car), never together, and never while the coach tip is up. Desktop is
unchanged. Touches the lineup/grid overlay code and `src/styles.css`.

## Acceptance criteria
- [ ] At 390x844, from PLAY to green light, no two of {lineup row, stats banner, steer tip} are visible at the same time (sampled every 250 ms)
- [ ] Both lineup and stats are still shown at least once on a first race
- [ ] Reduced motion: no fade animation, same sequencing
- [ ] 1280x720 layout is unchanged

## Test plan
Extend `tests/e2e/touch-layouts.spec.js` (or a new `grid-banners.spec.js`) to sample element
visibility on the grid at 390x844 and assert the exclusion rule.

## Out of scope
Redesigning the lineup chips or the stats card contents.
