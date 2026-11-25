---
id: 0305
title: Two more daily twists (OPEN ROAD, COLD START) without moving today's daily
status: ready
priority: P2
size: S
lens: content
created: 2026-11-25
pr:
---

## Why
The daily challenge has had four twists since 0023 (`MODIFIERS` in `src/daily.js`: HEAT WAVE,
GLASS CHASSIS, FLUX STORM, RUSH HOUR), so a returning player has seen every one inside a week and
"a new road every day" leans on the road alone. All four twists only nudge a start value in
`src/race-flow.js` (~line 301: `heatLevel`, `maxHp`, `fluxCharge`, `trafficGapScale`), so new
ones are cheap and need no Worker change. Rotating rule-bending "mutators" are the proven
daily-run hook; the reference is the Daily Climb in Slay the Spire,
https://slay-the-spire.fandom.com/wiki/Daily_Climb .

## What
Add two twists using only knobs that already exist, as data plus one `else if` each in
`race-flow.js`:
- OPEN ROAD: `trafficGapScale = 1.6` (about a third less traffic; rivals and the clock are the
  challenge), desc "Quiet road. Nobody to hide behind."
- COLD START: `fluxCharge = 0` and `heatLevel += 1`, desc "Flux starts empty. Earn your first warp."

**Pin today's rolls**: `dailySpec` must keep returning the same modifier for every day before a
`TWISTS_V2_FROM` UTC date (a few days after this ships, e.g. `'2026-12-02'`); only days on or
after it draw from the six-entry list. Keep the level and modifier draws in the same RNG order
as today (the 0155 rule: a daily that changes mid-day splits the board). Before building, read
`src/worker/plausible.js` and `scores.js` (frozen, read-only) and confirm the new twists cannot
make a legitimate score look implausible; if one can, drop that twist and say so in the PR.

## Acceptance criteria
- [ ] `dailySpec(day)` is identical to today's for 400 sampled days before `TWISTS_V2_FROM` (snapshot in the test)
- [ ] On/after the cut-over date both new twists appear within a 60-day sample, and every id has a `name` and `desc`
- [ ] The daily card and results show the new names without clipping at 390x844 and 1280x720
- [ ] Race start applies each new twist (`GameState.trafficGapScale`, `fluxCharge`, `heatLevel` asserted)
- [ ] `docs/CHANGELOG.md` line added

## Test plan
Extend `tests/unit/daily.test.js` with the pre-cut-over snapshot and a distribution check; a unit
or e2e case for the start values through `race-flow`'s modifier function.

## Out of scope
Twists that need new physics, a new HUD element or a Worker change; changing the level pick.
