---
id: 0014
title: Make the 88 mph warp an earned climax instead of a constant
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr: 5
---

## Why
Pillar 2. Holding the gas on level 1 triggers a warp after ~3 s and three warps in 5 s
(observed in a Playwright run, 2026-10-16). Rewards that fire constantly stop being rewards.
A warp should take a deliberate run-up (drafts, drifts, near-misses filling the flux meter).

## What
Tune flux gain sources (passive gain, pickups) and add a minimum cooldown between warps so
the first warp needs ~15–25 s of decent driving and later ones scale. Pure `src/flux.js`
helpers make the rates testable.

## Acceptance criteria
- [ ] Unit tests: passive-only flux from 0 takes ≥ 15 s to reach 100 at 88 mph; warp cooldown enforced
- [ ] e2e: holding only the gas for 8 s from a race start produces 0 warps
- [ ] Skilled play (drift/draft/near-miss) still reaches a warp within ~25 s (unit-level simulation)

## Test plan
`tests/unit/flux.test.js`; e2e reads `GameState.timeWarps` via a debug hook.

## Out of scope
Changing what happens during a warp.
