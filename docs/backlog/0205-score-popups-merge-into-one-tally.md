---
id: 0205
title: A fast near-miss chain shows one growing tally, not a stack of three plates
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-22
pr:
---

## Why
Scout's held-throttle play-through at 390x844 caught three score plates stacked over the
road just above the player's car at once (`+1200 x4`, `+1500 x5`, `x6`), each one lasting
long enough to hide the lane the player needs to read next. Pillar 3: at 100+ mph the
player must parse the screen in a glance, and the information in three plates is really one
fact: "chain is x6 and worth N". Arcade scoring guidance asks for immediate feedback that
lets the player understand what happened without reading a pile of text
(https://bugnet.io/blog/how-to-build-a-combo-system-that-feels-good,
https://itch.io/blog/810141/what-makes-a-great-scoring-system-lessons-from-the-arcade).

## What
In `src/popups.js` (layout) and its caller, when a new score plate arrives while an earlier
plate from the same chain is still alive, fold it into the live plate: the plate's points and
multiplier update in place (with the existing pop animation), its lifetime refreshes, and at
most 2 plates (one chain + one other source such as a pickup) are visible at once. Plates from
different sources (pickup vs near-miss) keep separate. No new DOM; no new per-frame allocation.
Main's startup JS budget is nearly full (see docs/LESSONS.md): keep the change inside
`popups.js` and its existing lazy chunk.

## Acceptance criteria
- [ ] Three near-misses inside the chain window leave at most 2 plates on screen, and the
      chain plate shows the running multiplier and total, not three separate lines.
- [ ] Pickup labels still appear separately from the chain plate.
- [ ] The plate stays within the road buffer and clear of the car box at 390x844 and 1280x720.
- [ ] Reduced motion: no scale pop, the numbers just update.
- [ ] No frame-time regression; main gz size budget unchanged.

## Test plan
Unit test on the popup layout/merge: feed 3 chain events within the window and assert one live
chain slot with the latest multiplier and summed points, plus a separate pickup slot.
E2E at 390x844: force three chain events and assert at most 2 plate elements are visible.

## Out of scope
Changing scoring values or the chain window. Redesigning the plate art.
