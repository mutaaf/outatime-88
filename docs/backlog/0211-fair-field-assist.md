---
id: 0211
title: "Fair field" setting softens rival catch-up
status: proposed
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
- [ ] Default save yields today's exact pace values (old saves unchanged)
- [ ] FAIR FIELD reduces the catch-up term by the documented factor, with unit tests on the pure function
- [ ] Ignored in live rooms and the daily challenge (test asserts)
- [ ] Keyboard-reachable and 44 px on touch; no new hosts

## Test plan
Unit on raceflow pace with both modes; settings normalise test with an old-shape save; e2e
toggle persists across reload.

## Out of scope
Per-rival difficulty, new AI behaviours. Depends on 0196 (fairness test) landing first.
