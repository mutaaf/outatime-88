---
id: 0306
title: Break updateGame into named phases without changing a single result
status: ready
priority: P2
size: M
lens: tech-health
created: 2026-11-24
pr:
---

## Why
Pillar 7 asks for the big modules to be carved into focused, tested pieces. `src/race-step.js`
is 1,981 lines, the largest file in `src/`, and `updateGame(dt)` is the one function every
race feature (damage, drift, NOS, warp, pickups, set pieces, hazards) has to edit, so each new
ticket grows it and every edit is a merge-conflict risk for the Builder. The 120 Hz sim must
stay bit-for-bit the same (live races, ghosts and the Worker's score check all rely on that,
AGENTS.md § Graphics tiers), so the carve needs a proof, not trust. The repo already has the
proof tool: `npm run balance` plays seeded bots through the real sim (docs/BALANCE.md).

## What
Inside `src/race-step.js` only (no new chunk, so no new network request and no budget move),
split `updateGame` into named phase functions called in the same order, such as `stepInput`,
`stepPlayerMotion`, `stepTraffic`, `stepCollisions`, `stepScoring`, `stepWarp`. Pure
extract-and-call: no reordering, no renamed state, no new allocations (pass the existing
objects; do not build option bags per step). Capture a fingerprint first: run 3 seeded bot
races on current `main` (campaign, endless, daily) and record each run's final distance, score,
HP and a hash of `GameState` sampled every 120 steps; the same numbers must come out after.
Put the fingerprint test in `tests/unit/` so it guards every later change to the step.

## Acceptance criteria
- [ ] `updateGame` is ≤ 120 lines and reads as a list of phase calls
- [ ] Each phase function is < 200 lines and is named for what it owns
- [ ] The fingerprint test passes on the new code AND is shown (in the PR body) to fail when
      one phase's call is swapped with its neighbour
- [ ] `npm run balance` output identical before and after
- [ ] `race-step-*.js` gzip size changes by < 300 B; main's startup size is unchanged (budget.spec.js green)
- [ ] No per-frame allocation added (the existing no-alloc check, if any, still passes)
- [ ] Behaviour change in the same PR: none (one concern per PR)

## Test plan
New `tests/unit/step-fingerprint.test.js`: run seeded bots for fixed step counts and compare
to a checked-in snapshot of the numbers above. Existing unit and e2e suites unchanged and green.

## Out of scope
Moving code into other chunks, changing any constant, renaming `GameState` fields, 3D view.
