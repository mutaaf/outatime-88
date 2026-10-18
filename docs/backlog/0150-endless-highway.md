---
id: 0150
title: Endless Highway is the default — tiers that level up, HP that goes both ways
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-18
---

## Why
The user: "infinite highway mode [should] be the default and be promoted like its the best level
up type of game play … things get progressively harder as you level up, and HP should be properly
incrementing and decrementing." Endless existed but was hidden behind EVENTS, its difficulty
maxed out in ~40 s (the arcade wave clock: a wave every 550 distance, speed capped by wave 7),
and HP only ever went down until a wreck ended any race.

## What shipped
- **Default mode.** PLAY, a tap anywhere and Enter on the title start the Endless Highway. The
  title chip shows your best distance and tier to beat; EVENTS lists ENDLESS HIGHWAY first and
  TRACK RACE (3 laps, medals) second. `?play=infinite` points PLAY at it; `?level=N` still
  picks a track race on that level; NEXT RACE on the results is a track race.
- **Tiers (src/endless.js, pure).** Tier n starts at `(n−1)·2600 + 450·(n−1)(n−2)/2` distance
  (≈30 s, then each a bit longer). Difficulty `1 − e^(−(tier−1+frac)/7)`: 0 → 0.43 at tier 5 →
  0.72 at tier 10, smooth through boundaries. It drives, in endless only: the wave scale
  (speed cap, traffic speed and density, hazard rhythm — still always a clean line), curve
  amplitude of new road (+30% at full difficulty, `setTrackIntensity`), and a coin-cash
  multiplier (+0.2× per tier, max 3×; points unchanged so the server's re-check holds).
- **LEVEL UP.** Banner, rising chime, `lap` haptic, spark burst, a beat of slow-mo, +15% max HP
  patch-up and a new era every tier.
- **HP both ways.** Hits subtract (armor-scaled, as before), wrenches/level-ups/regen add, all
  clamped 0..max. The race HUD bar flashes red with a floating −N on a hit and glows green with
  +N on a heal, pulses under 30% with a one-time LOW HP call-out. HP 0 ends an endless run
  (results: distance, tier, best, share card); in a track race the pit crew patches you to 35%
  and you race on (the lost speed is the cost); live races respawn as before.
- **Contract for other systems:** `GameState.tier` (endless tier; else 1 + level index) and
  `GameState.difficulty` (0..1, never decreasing within a run; track races: level base
  0.15–0.75 + 0.2 × race progress; live: level base only, identical on every client).

## Not in this PR
Runner extras (pursuer, run missions with a permanent multiplier, a coins-only continue, best
marker on the road, swipe lanes) follow in their own PRs. The Infinite board still ranks by
score on the server (distance ranking needs an op/ change).
