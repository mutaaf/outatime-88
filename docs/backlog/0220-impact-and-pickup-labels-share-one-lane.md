---
id: 0220
title: An impact label and a pickup label never stack on the car (one hit-text lane)
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-28
pr:
---

## Why
Pillar 3 says never two texts on top of each other. 0114 queued the *pickup* plates, but
the shockwave labels (`spawnObstacleShatter`: "💥 SOLID TRAFFIC IMPACT!", takedown and
chain-hit text) are a separate list (`GameState.hitShockwaves`) with their own anchor. In a
scout play-through, a wrench pickup taken while crashing through traffic drew "+15 💚 HP
REPAIRED!" (390x844) and "💚 HP FULL!" (1280x720) directly over/under "💥 SOLID TRAFFIC
IMPACT!" at the car's rear: two plates fighting for the same pixels, in the busiest second
of the race. Racing HUD guidance favours short, peripheral-readable feedback rather than
competing text ([Bumper UI, car game interfaces](https://www.hudsandguis.com/2013/08/21/car-game-interfaces-bumper-ui/)).

## What
Give every floating hit/pickup label one shared slot manager: a new label that would land
within ~300 ms of a live one either stacks one plate-height above it (fixed offset, never
over the car's roofline) or, if three are live, replaces the oldest. Impact/takedown text
outranks a pickup plate (the pickup's icon and sound still fire). Touches `src/race-step.js`
(`spawnObstacleShatter`, `spawnAcquireAnimation`) and the plate draw in the renderer; keep
main-bundle growth under the headroom in docs/LESSONS.md (put the helper in an existing lazy
module if one is already loaded in a race).

## Acceptance criteria
- [ ] A pure helper assigns each label a y-slot; two labels spawned within 300 ms get different slots (unit test)
- [ ] Rects of simultaneously live labels never intersect, in a forced crash + wrench pickup at 390x844 and 1280x720
- [ ] No label rect intersects the player car's box; all inside the canvas
- [ ] Calm motion unchanged; no per-frame allocation added

## Test plan
Unit test for the slot helper. E2E via the `?debug` hook: spawn a shatter and an acquire
within 100 ms, read both label rects, assert no overlap at both viewports.

## Out of scope
Changing which events show text, point values, or the plate art.
