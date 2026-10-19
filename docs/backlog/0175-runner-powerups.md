---
id: 0175
title: Runner power-ups — magnet, shield and 2X coins, upgraded with FLUX cash
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr: 97
---

## Why
Endless runs (0150/0151) have goals, a pursuer and a continue, but nothing on the road changes
how a run plays for a few seconds. Subway Surfers and Temple Run keep every run fresh with
power-ups you can see coming, feel the moment you grab them and upgrade between runs.

## What
- Three power-ups, Endless solo runs only (`src/powerups.js`, rules; `src/pickups.js` placement):
  - **MAGNET** (8 s): every coin in nearby lanes flies to you.
  - **SHIELD** (20 s or one crash): a bubble around the car takes one traffic, barrier, rival or
    hard wall hit. No HP, speed or points lost, and it shatters with a burst.
  - **2X COINS** (10 s): coin cash doubles, on top of the tier's coin multiplier.
- Placement is seeded and deterministic (`powerupAt`). There is one candidate slot per ~160
  segments (about one power-up every 15–20 s at speed), a little closer and more likely each Endless tier, and never within the pickup gap
  of anything else.
- Crisp shape-coded icons in `src/pickup-art.js`: a horseshoe magnet, a crest shield and a "2×"
  star badge. There are also low-poly meshes in 3D.
- The HUD has a countdown ring per active power-up on the left edge, blinking for the last two
  seconds, and a bubble around the car while the shield is up.
- Each power-up has its own cue from the CC0 sample bank.
- Upgrades: each power-up has 5 levels that make it last longer. You buy them on the results
  card or in the pause panel with earned FLUX cash only (no money, no ads). They are stored in
  `save.endless.power`.
- New run goals: grab N coins with the magnet, block N crashes with a shield, grab N power-ups,
  and earn N ⚡ on 2X coins.

## Not changed
- Points: power-ups pay 0 points, and the doubler multiplies cash, not points.
- A shielded hit isn't logged, exactly like the existing invulnerability frames.
- The server's recompute and plausibility checks are unchanged: no `src/worker` change.
- Arcade, daily and live races never see power-ups.

## Acceptance criteria
- [x] Unit tests for timers, the shield, upgrades, placement and goals (`tests/unit/powerups.test.js`).
- [x] E2E: a magnet pulls coins, a shield blocks a crash with no HP lost, 2X doubles cash, the
      ring shows, and the shop spends cash (`tests/e2e/powerups.spec.js`).
- [x] Main bundle untouched apart from placement hooks; the logic lives in the lazy race-step chunk.

## Test plan
`npm run check` (unit + e2e), plus a look at 1280x720 and 390x844 with `?debug`.
