---
id: 0073
title: Sloppy driving costs points — hits and wall scrapes are penalised, checked by the server
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-17
pr: 34
---

## Why
Score only ever went up: ploughing through barriers and traffic cost HP but not points, so a
reckless run could out-score a clean one. Kids asked for scores to "detract" on obstacles.

## What
`src/scoring.js` (shared by the game and the leaderboard Worker):
- Obstacle hit = 5,000 + 150 × impact mph; traffic crash = 6,000 + 180 × impact mph;
  grinding a wall at ≥ 30 mph = 4,000 per second. Charged live (`chargePenalty` in main.js),
  shown as a red "−18,650 BARRIER HIT" popup by the score.
- Final score = max(0, earned − penalty). Results show "earned − penalty (2 HITS · 1 CRASH ·
  1.4s WALL)" or "CLEAN RUN".
- The run log is the impact speed of each hit plus whole wall milliseconds; it rides on the
  leaderboard submission (`earned`, `pen`) and `src/worker/plausible.js` recomputes the
  penalty and rejects a score that doesn't match; rate limits apply to the earned points.
  Old clients without a log are still accepted.
- Wrong-way and respawn penalties aren't modelled: the car can't reverse and a wreck ends the
  run, so neither can happen in today's game.

## Acceptance criteria
- [x] Live charges equal the server's recomputation exactly (integer log)
- [x] Popup on a hit/scrape; results breakdown; clean runs say so
- [x] Server rejects a score that doesn't match its penalty log
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/scoring.test.js` (speed scaling, exact live/server agreement over 120 Hz wall
steps, floor at zero, log cap fits the 2 kB body limit), `tests/unit/worker-leaderboard.test.js`
(mismatch, bad logs, floored scores, earned-rate limits), `tests/e2e/penalty.spec.js` (grind
the wall → popup → breakdown → payload carries the log; clean run).

## Out of scope
Per-car leaderboards (the run now carries `car` for the leaderboard work to use).
