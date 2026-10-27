---
id: 0211
title: "Fair field" setting softens rival catch-up
status: shipped
priority: P2
size: M
lens: player-feel
created: 2026-10-23
pr:
---

## Why
Racing-game players split on rubber banding: it keeps packs tight but reviewers call it
heavy-handed and ask for an option to soften it (see the Hotshot Racing and Galactic Racer
threads: https://steamcommunity.com/app/609920/discussions/0/2952628643853821162/ and
https://steamcommunity.com/app/4078430/discussions/1/594069606514154693/ ; academic overview:
https://content.iospress.com/articles/icga-journal/icg220207 ). Our rivals use rubber-band
pace (`src/raceflow.js`, rival AI); a skilled player should be able to choose pure pace.

## What
Add Settings → RIVALS: CLOSE PACK (default, today's behaviour) / FAIR FIELD (catch-up scaled
to about 40%). Stored under `SaveStore.data.settings` with a default. Pure scale applied in
`src/raceflow.js`. Live races and server-checked scores must be unaffected: the setting is
ignored in rooms and dailies.

## Acceptance criteria
- [x] Default save yields today's exact pace values (old saves unchanged)
- [x] FAIR FIELD reduces the catch-up term by the documented factor, with unit tests on the pure function
- [x] Ignored in live rooms and the daily challenge (test asserts)
- [x] Keyboard-reachable and 44 px on touch; no new hosts

## Test plan
Unit on raceflow pace with both modes; settings normalise test with an old-shape save; e2e
toggle persists across reload.

## Out of scope
Per-rival difficulty, new AI behaviours. Depends on 0196 (fairness test) landing first.

## Shipped
Settings → RACE → RIVALS: CLOSE PACK / FAIR FIELD (`settings.rivals`, default `pack`). The pure
scale lives in `src/fair-field.js` (`FAIR_FIELD = 0.4`, `catchUpScale`), not `src/raceflow.js`:
raceflow ships in the startup bundle, which has ~120 bytes left, so the rule sits in the lazy
race-flow chunk and main only grew 3 bytes. Race start sets `GameState.catchUp`; the rival AI
(`fillWorld` → `w.band`, which scales both the push and the ease-off in `stepRival`) and the
fallback driver (`rivalTargetMph(pace, lead, k)`) read it. Rooms and dailies always get 1. The
setting takes effect from the next race. Tests: tests/unit/fair-field.test.js,
tests/e2e/fair-field.spec.js.
