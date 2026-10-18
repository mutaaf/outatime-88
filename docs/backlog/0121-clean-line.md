---
id: 0121
title: Always a clean line — fewer hazards with rhythm, and one way through that never costs a point
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-17
pr: 60
---

## Why
Players (the operator's kids) said there are too many obstacles, and sometimes there's no way
through without losing points.

## What
- `src/cleanline.js`: a seeded racing line per race (smooth, inside the walls, never faster
  sideways than the slowest car can steer at top speed). Obstacles, cone patterns, barrels and
  traffic are placed and steered so nothing that costs points ever touches it. Traffic drifts
  to a clear lane or the shoulder and never crosses the line.
- Rhythm: sections go normal → dense → breather → easy, rising gently with level and wave.
  Hazards per 100k track Z: ~75 → ~43.
- Debris rule: an obstacle or prop someone else knocked out of place bounces you but costs no
  points.
- Live rooms and dailies share the line (it's seeded from the race seed).

## Acceptance criteria
- [x] 500 seeds × 5 levels: nothing that costs points touches the line
- [x] a car steering at 0.55 lane/s finds a clean path at 55, 95 and 135 mph
- [x] hazards per 100k track Z are at most 75% of the old generator's
- [x] every car can steer sideways faster than the line moves, at top speed (real handling model)

## Test plan
`tests/unit/cleanline.test.js`: line bounds and slope, determinism, the 500-seed property test
(obstacles, cones and barrels over their whole length; traffic at every step), a lane × distance
search (mutation-checked: removing the clearance or the traffic lane keeping fails it), the
density metric, and the handling-capacity check. e2e smoke/race/props/penalty/feel unchanged.

## Out of scope
Showing the racing line on screen; set-piece layouts (0123).
