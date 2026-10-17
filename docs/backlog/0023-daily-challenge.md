---
id: 0023
title: Daily challenge — one seeded road and one twist per day, with its own board
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 19
---

## Why
Operator: "more complexity". A daily challenge is depth without clutter: the same road, the
same rivals and the same twist for everyone, a fresh reason to come back every day, and a
fair board to compete on (everyone plays identical conditions).

## What
- `src/daily.js`: `dailySpec(utcDay)` picks the level and one of four modifiers (HEAT WAVE,
  GLASS CHASSIS, FLUX STORM, RUSH HOUR) from an FNV-1a seed of the date; `mulberry32` drives
  traffic so rivals and civilians appear identically for everyone.
- Played from the leaderboard's DAILY CHALLENGE card; arcade rules; doesn't touch the
  campaign selection or medals; posts to the `DAILY` board.

## Acceptance criteria
- [x] Unit: same spec all day, varies by day, covers every level and modifier in a month,
      seeded RNG repeats exactly
- [x] e2e: PLAY DAILY starts today's level and posts with mode DAILY
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/daily.test.js`; `tests/e2e/leaderboard.spec.js`.

## Out of scope
Ghost of the daily leader (see 0012).
