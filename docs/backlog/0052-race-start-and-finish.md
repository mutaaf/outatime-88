---
id: 0052
title: Race day — every racer called out on the grid, 3-2-1-GO with a rocket start, a chequered flag and a podium
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-17
pr: 31
---

## Why
Kid playtest (2026-10-17): "we need an actual race start and end with the racers called out
like in Mario Kart". 0051 made the race real; this gives it a beginning and an ending.

## What
- `src/racecall.js` (pure): the start timeline (one card per racer → grid → 3 red lights →
  GO), rocket-start judging (tap ⚡ in [-0.35 s, +0.12 s] of green = ROCKET, to +0.45 s = good,
  earlier = jumped start and a stall), announcer lines per grid slot, settled + rate-limited
  position callouts and lap/FINAL LAP calls, finish order with times (projected `*` for cars
  still on track; TIME UP / WRECKED for you), and a headline by how it went (win from the
  back, comeback, so close, last-place joke).
- `src/racestage.js`: lineup cards (colour portrait, slot, name, car, crew), grid chips, start
  lights, chequered flag, podium rows; beeps, a placement fanfare, and on-device speech
  (`speechSynthesis`, off when muted or with the new ANNOUNCER VOICE setting off).
- `src/main.js`: `racePhase` START → RACING → FINISHED. Nothing moves before green; the
  lineup plays on the first race of a level per visit (tap to skip), retries go straight to
  the lights. After the line: flag + fanfare, a 2.8 s roll-out (1.4 s calm) while the field
  crosses, score frozen, then results. `?debug` skips the ceremony unless `&intro`.
- Results: headline, every racer in finish order with their time, then score, board, and
  RANKS / RETRY / NEXT (next open level). Two columns on tablets and phone landscape.
  `GameState.lastResult` keeps the run's story (for sharing, ticket 0053).

## Acceptance criteria
- [x] Six cards, one per racer, you last; tap skips to the lights; no movement before GO
- [x] Rocket start on green; jumping the start stalls you
- [x] Lap 2 / FINAL LAP / position callouts without flicker
- [x] Flag, then finish order with every racer named and timed; Retry / Next / Ranks on screen at 360x640, 844x390, 820x1180
- [x] Calm mode: no pop/wave animations, shorter roll-out

## Test plan
`tests/unit/racecall.test.js`; `tests/e2e/ceremony.spec.js` (lineup + skip, rocket and early
starts, retry skips lineup, finish flag → podium at three sizes, NEXT).

## Out of scope
Sharing the result (0053); multiplayer rooms (their own work).
