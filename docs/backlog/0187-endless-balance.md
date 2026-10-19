---
id: 0187
title: Endless balance — a bot harness that measures difficulty and the coin economy, and a tuning pass from its numbers
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-19
pr: 119
---

## Why
#108 made Endless runs end, #102 raised every score about 60%, and power-ups and continues
added a coin economy. Nobody had measured the result. The first harness numbers show casual
players dying in about 2½ minutes after racing through five tiers, every Endless minute paying
about 900 coins (a car every run), and campaign bronze and silver now free for anyone.

## What
- **Harness:** `npm run balance` (tests/balance, playwright.balance.config.js). Four seeded
  bots (novice, casual, good, expert) play the real race step flat out through `?debug`'s
  `__OT.sim`. They keep their coins across runs, pay for continues and buy upgrades.
  `report.mjs` writes the tables. Campaign mode re-measures the medal targets.
- **A tuning pass from those numbers** (docs/BALANCE.md has the before/after):
  - longer tiers;
  - one or two new hazard kinds per tier;
  - sparser early hazards and earlier warnings for lane-switch hazards;
  - level-up heal 15% → 8%, and fuel drain up to 2× at depth;
  - more power-ups early;
  - Endless pays 35% of campaign cash (fractions carried exactly);
  - power-up levels cost 600–3,400;
  - medal targets re-measured.

## Acceptance criteria
- [x] Novice: first runs last ≥ 60 s at p10, and no run-ending hazard comes before ~45 s.
- [x] Casual: median 3–4 min, reaching tier 3–4.
- [x] Expert: keeps climbing, with tier 8+ hard (median about 8 min at tier 8).
- [x] No death cause above ~40% for any bot.
- [x] About one purchase per 2–3 casual runs across the power-up ladder.
- [x] Scores are untouched and server-compatible (no payload or worker change). Main stays
      under 59 kB.

## Test plan
- **Unit:** `endlessCash` exactness, the hazard unlock order, and medal fixtures.
- **E2E:** the existing endless, hazards, pickups and power-ups specs, updated for the new
  tier distances and Endless cash.
- **Balance:** `BAL_PLAYERS=10 BAL_RUNS=6 npm run balance` and
  `BAL_MODE=campaign BAL_RACES=10 npm run balance`, then `node tests/balance/report.mjs before after`.
