---
id: 0071
title: A car roster with real specs and earned unlocks
status: shipped
priority: P1
size: L
lens: content
created: 2026-10-17
pr: 26
---

## Why
Kids asked for cars to unlock. Every car was open from the first second (plus a "summon"
button that spawned random free cars), so there was nothing to chase, and the car's
listed stats barely touched the physics (speed bonus and mass only).

## What
`src/cars.js`: 11 original cars, each rated 1–10 on top speed, acceleration, handling, flux
and durability with the same 30-point budget, so every car trades something away. The
ratings drive the sim (`carParams`): top speed, launch rate, steering response and curve
pull, drift slip angle, passive flux and warp length, max HP and damage taken. Two starter
cars; the rest unlock by coins (bought in the garage), campaign medals, 1st-place wins,
career takedowns, daily streaks and rivals beaten (finishing ahead of a rival, or the
leaderboard's rival system via `noteRivalBeaten`). Locked cars show how to unlock them and
can't be driven; the car you pick is remembered; the results screen announces new cars.
Save gains `garage` and `career` (defaults merged on load; old saves get the cars their
medals already earned). Leaderboard submissions now include the `car` id. The summon button
became a garage shortcut; the duplicate light-cycle was dropped.

## Acceptance criteria
- [x] Equal rating budget; no car dominates another in ratings or sim parameters
- [x] Locked cars can't be selected and say how to unlock
- [x] Milestones unlock cars across races; coin cars are bought
- [x] Old saves load with starters plus medal-earned cars
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/cars.test.js` (budget, dominance, spread, neutral baseline, roster HP, every
unlock type, streak gaps, damaged-save repair), `tests/unit/save.test.js` (old saves),
`tests/e2e/cars.spec.js` (locked → earned → remembered → raced with its HP).

## Out of scope
The garage showroom UI (0072). Server-side sync of the garage (waits for the identity module).
