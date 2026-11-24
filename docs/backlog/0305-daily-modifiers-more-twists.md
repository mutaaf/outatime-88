---
id: 0305
title: Four more daily twists, so the daily challenge stops repeating every fourth day
status: ready
priority: P2
size: M
lens: content
created: 2026-11-24
pr:
---

## Why
`MODIFIERS` in src/daily.js has four entries (HEAT WAVE, GLASS CHASSIS, FLUX STORM, RUSH HOUR),
and the date picks one, so a returning player sees the same twist every few days and the daily
is a repeat of one of four rules. A daily keeps its pull through variety in the rule, not in
the road alone (a judgement from the design, no outside source). The twists are
client-only today (`applyDailyModifier` in src/race-flow.js; the Worker does not read the modifier id:
`grep -n modifier src/worker/*.js` finds nothing), so adding some needs no server change.

## What
Add four ids to `MODIFIERS` and to `applyDailyModifier`, each one a single start-of-race state
change in the style of the existing four, using fields the sim already has (no new physics):
- `LEAD_FOOT`: `GameState.fluxCharge` starts at 0 but flux pickups give 1.5× (find the
  multiplier through the existing `PICKUP`/`passiveFluxRate` rules; add a `GameState.fluxGain`
  default 1 and read it where flux is added)
- `LOW_GRIP`: the era `grip` multiplier is 0.9 for the race (a `GameState.gripScale` default 1,
  read in the one place handling takes the era grip)
- `THIN_FIELD`: `GameState.trafficGapScale = 1.4` (half as busy, the opposite of RUSH HOUR)
- `NOS_HAPPY`: the NOS tank refills 1.5× as fast (`GameState.nosRefillScale`, default 1)
Every id needs a name and a one-line `desc` that fits the announcement (≤ 32 chars).
The day → modifier mapping changes for every day (the list is longer): that is expected; it
changes tomorrow's twist, never a stored score.

## Acceptance criteria
- [ ] `MODIFIERS` has 8 entries with unique ids; every id has a branch in `applyDailyModifier`
      (a unit test fails when one is missing)
- [ ] Each new twist changes exactly its field at race start and resets to the default for a
      non-daily race, a live room and a campaign race (no leak between races)
- [ ] The daily banner and the home daily hook read the new names without clipping at 390x844
      and 1280x720
- [ ] Across 60 consecutive dates the picker returns all 8 ids at least once
- [ ] Leaderboard submission and the rest of the daily flow are untouched (no frozen path edited)

## Test plan
Unit (`tests/unit/daily.test.js`): list shape and the 60-day spread; a table-driven test that
runs `applyDailyModifier` for each id against a fresh GameState and checks the one field.
E2E: start `?play=daily` with a date forced to each new id (the existing daily e2e helper) and
read the announcement text.

## Out of scope
Per-modifier leaderboards, a modifier picker, anything that changes rival AI or the track.
