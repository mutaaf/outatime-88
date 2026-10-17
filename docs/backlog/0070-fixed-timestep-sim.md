---
id: 0070
title: Fixed-timestep simulation with a blended render
status: shipped
priority: P1
size: M
lens: performance
created: 2026-10-17
pr: 25
---

## Why
The race used one variable `dt` per frame, so the same input played differently on a 30 fps
phone, a 60 fps laptop and a 144 fps monitor (lerp factors, drift build-up, collision sweeps
all scale with the frame), and below 20 fps the whole game ran in slow motion. Kids on older
iPads got a different, slower game.

## What
`src/fixedstep.js`: an accumulator that advances the simulation in 1/120 s steps (catches up
on frames down to 10 fps, slow motion only below that). `mainLoop` runs `updateGame(step)` +
`syncContactZ()` per step, then the HUD once per frame, then renders the frame blended between
the last two steps (track position, player X/Y, every rigid body), so motion stays smooth when
the display rate doesn't divide 120 Hz. Rigid bodies keep 240 Hz integration (2 sub-steps).

## Acceptance criteria
- [x] Same number of steps and the same state for 30, 60 and 144 fps and jittery frames
- [x] Long stalls are capped (no spiral of death)
- [x] Whole e2e suite green; gas-only race still ends inside the level cap
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/fixedstep.test.js`: integrates a toy car with explicit Euler through 30/60/144 fps
and jittery frame sequences and asserts identical step counts/positions; 60 fps = exactly 2
steps for 5 minutes; stall cap; alpha.

## Out of scope
Determinism across devices for replays (Math.random still drives traffic outside the daily).
