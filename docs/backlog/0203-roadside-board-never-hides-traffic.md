---
id: 0203
title: Roadside sponsor/"BEAT THE BOARD" billboards must not sit on top of rivals in the lane ahead
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-22
pr:
---

## Why
At 1280x720 mid-race on the orange-track stretch, the BEAT THE BOARD billboard plate drew
across the lane ahead, covering a rival (RIN) and the pickup, with three stacked score
pop-ups on top of it. Rivals and hazards you must read at speed vanished behind scenery.
Design writing on racing UI stresses keeping the screen's focal area clear for what
matters ([Car Game Interfaces – Bumper UI](https://www.hudsandguis.com/2013/08/21/car-game-interfaces-bumper-ui/)).

## What
Make overhead/gantry boards in `src/billboards.js` (and the 2D draw path) draw behind
cars and hazards, or fade to ~35% alpha when a car/hazard is within their screen rect
(same idea as shipped 0200). Touch only the board z-order/alpha logic.

## Acceptance criteria
- [ ] A rival or hazard overlapping a board's rect is drawn fully opaque on top of it (unit test on the sort/alpha decision)
- [ ] Screenshot at 1280x720 and 390x844 shows the rival tag and car readable in front of a board
- [ ] No frame-time regression (perf probe within budget); main JS budget respected (see LESSONS)

## Test plan
Unit test the draw-order/alpha helper with a car inside and outside the board rect; one
e2e screenshot assertion that board pixels are not drawn over a forced rival.

## Out of scope
New board art or sponsor content.
