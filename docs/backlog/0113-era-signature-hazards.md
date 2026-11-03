---
id: 0113
title: One signature roadside hazard per era, built on the knockable-prop physics
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-18
pr: 175
---

## Why
Pillar 5: eras should differ in hazards, not only palette and props. Ticket 0074 gave the
game knockable cones and barrels with real momentum; each era can reuse that system for one
memorable, original obstacle so a warp changes how you drive: 1885 rolling tumbleweeds,
1955 slow pastel delivery vans, 1985 shopping-trolley spills, 2015 hover-drone debris,
2088 drifting light-barriers, 2026 puddle splashes that cut grip briefly.

## What
Add a per-era `hazard` entry in `src/data.js` (kind, spawn rate, penalty) and spawn it via
the existing prop pool in `src/physics.js`/`src/world.js` (no new allocations per frame).
Keep penalties small and telegraphed (visible 1+ s ahead). Split per era if it grows.

## Acceptance criteria
- [x] Unit: each era resolves a hazard config; spawns are deterministic per seed (daily stays identical)
- [x] Each hazard is visible ≥ 1 s before contact at 120 mph and always leaves an open lane
- [x] No new per-frame allocations; e2e perf probe within budget
- [x] Names and art are original (IP denylist test passes)

## Test plan
`tests/unit/hazards.test.js` (config + determinism + open lane); e2e race in two eras via `__OT`.

## As shipped (PR #175)
- Config lives in `src/era-hazards.js` (race-step chunk), not `src/data.js`: main was at 58.82/59 kB gz.
- Props: 2026 sidewalk sign, 1985 shopping cart, 1885 tumbleweed, 2015 drone wreck, 2088 light pylon,
  1955 milk crates, 2061 comet ice. No grip-cutting puddles or slow vans: every hazard is a knockable
  prop with a cone penalty, so the server's penalty recompute needs no change.
- Spill rate and footprint are shared by every era (`SPILL`), so a daily or live room places the same
  props whenever each player warps; only kind, mass and art follow your era. Props already placed
  before a warp keep their old era's kind (up to ~11k units of road).
- Tests: `tests/unit/era-hazards.test.js`, `tests/e2e/era-hazards.spec.js`.

## Out of scope
New car models, police AI changes, 3D-only art.
