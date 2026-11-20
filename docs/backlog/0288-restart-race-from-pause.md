---
id: 0288
title: RESTART RACE on the pause sheet, so a bad start is one tap from a clean one
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-11-19
pr:
---

## Why
Pillar 2 and the "five minutes" promise: when a campaign race starts badly (a wreck at the
lights, a missed rocket start) the only ways out of the pause sheet today are BACK TO THE
TRACK, CHANGE LEVEL, SETTINGS and QUIT HOME (`index.html` `#garageActions`; a grep for
"restart" in `index.html` finds nothing). The player must quit, wait for the title and pick
the event again. Arcade racers treat an instant retry as core: a short loop of
fail → retry is what makes best times and the lap split (0286) worth chasing. Game-design
writing on quick restart: https://www.gamedeveloper.com/design/the-importance-of-quick-restarts
(general reference; the rule of thumb is under ~2 s from decision to lights).

## What
Add a `RESTART RACE` button to the pause sheet for solo campaign and daily races (not
Endless runs, live races or TV pads, where a restart makes no sense). It re-runs the same
`startRace` call the player used (same level, car, mode, seed for the daily) and goes
straight to the start lineup, skipping the title. Put the glue in a lazy chunk
(`src/race-late.js` or a new import-only module) and the button markup in `index.html`
(static markup costs no JS bytes). Main has under 1 kB of headroom after 0285/0287: add
no main code beyond a one-line hook. Pad: reachable through the 0273 menu focus; no new
key (R is ROAR).

## Acceptance criteria
- [ ] Pause during a campaign race shows RESTART RACE; it is absent in Endless, live races and TV pad mode
- [ ] Tapping it starts the same event with the same car and, for the daily, the same seed; `raceTime`, score, `lapSplits`, damage and positions are reset
- [ ] The best time, ghost and career stats from the abandoned attempt are not recorded (a restart is not a finish or a loss)
- [ ] Focus lands on the lights/first control, and the pad D-pad reaches the button
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; the sheet still fits at 844x390 (0240)
- [ ] Main startup JS stays under the 57 kB budget

## Test plan
New `tests/e2e/restart-race.spec.js`: start a campaign race, advance, pause, press RESTART
RACE, assert `GameState.raceTime` back near 0, same `levelId`/car, no best written to
`SaveStore`; assert the button is hidden in Endless. A unit test for any pure helper that
picks the restart arguments.

## Out of scope
A restart in live races, a restart keybind, a "restart from checkpoint".
