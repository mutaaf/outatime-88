---
id: 0286
title: Lap split versus your best lap, announced the moment you cross the line
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-11-19
pr:
---

## Why
Racing games lean on a split delta ("-0.42" green, "+0.31" red) to make every lap a small
duel against yourself; it is the cheapest "one more run" hook there is and costs no server.
Today `RS.lapStartedAt`/`GameState.lapSplits` (src/race-flow.js ~l.601) record each lap, but
only the share card's `bestLap` reads them: nothing tells you mid-race whether that lap
beat your best, and the best lap is not saved between sessions. Pillar 5 (local best times)
and pillar 2 (tension and release).

## What
Add a defaulted `SaveStore.data.bestLaps` map (level id → best lap seconds; defaults only,
old saves keep working, invariant 6). When a solo, non-daily race crosses a lap boundary,
compare that lap with the saved best for this level and show the delta on the existing
announcement channel (`announcer.js`, one text at a time, so it queues behind a place
change or "Final lap!" rather than stacking): "LAP 2  -0.42" in the green already used for
gains, "+0.31" in the amber used for losses, never red/green alone (a "-"/"+" sign and an
up/down glyph carry it, as in 0167). Update the saved best at race end. Put the compare and
formatting in a pure, unit-tested module loaded by the lazy race-late chunk (race-flow is at
its budget and main has ~50 B spare; see 0285).

## Acceptance criteria
- [ ] First lap on a level with no saved best shows no delta and saves the lap time
- [ ] A faster lap shows "-x.xx" with a down/gain glyph; a slower one "+x.xx" with an up glyph; the text is whole at 320 px wide
- [ ] Never shown in live rooms, TV mode, endless runs or while another announcement of higher priority is up (it waits, then drops if stale)
- [ ] `bestLaps` survives reload; an old save without it loads cleanly (unit test with a real old-shape save)
- [ ] Reduced-motion players get the same text with no flash or slide
- [ ] Main startup JS does not grow; race-step / race-flow budgets hold
- [ ] Screenshot at 1280x720 and 390x844 shows the delta clear of the HUD and pads

## Test plan
Unit: delta maths, formatting, save defaults and old-save load. E2E (own spec file, per the
lessons): start an ARCADE race with `__OT.startRace`, force a lap crossing, assert the
announcer text and the saved `bestLaps`.

## Out of scope
Per-sector splits, a ghost-synced delta, server-side lap boards.
