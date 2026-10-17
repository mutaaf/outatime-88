---
id: 0027
title: Traffic formations that escalate by wave — readable patterns instead of random spawns
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-17
pr:
---

## Why
Depth pillar. Civilian traffic respawns one car at a time at random lanes, so difficulty
only rises through speed. Great arcade racers escalate with *patterns* the player learns to
read: a wall with one gap, a slalom, a police box, a rolling roadblock. Learnable patterns
reward skill and make the near-miss chain (0009) something you can plan for.

## What
- `src/formations.js` (pure): a table of formations (lanes + spacing), unlocked by
  `GameState.waveTier`, drawn with the traffic RNG (`trafficRand` in main.js) so the daily
  challenge stays identical for everyone.
- `LiveTraffic` respawn places a whole formation when a slot frees instead of one car.
- Each formation always leaves at least one open lane (unit-tested).

## Acceptance criteria
- [ ] Unit: every formation leaves an open lane; wave 1 only gets the gentle ones; the same
      seed yields the same sequence
- [ ] e2e: a 60 s run still ends (race clock) and the perf probe stays within budget
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/formations.test.js`; existing perf and feel specs.

## Out of scope
New car models or police AI behaviour.
