---
id: 0113
title: One signature roadside hazard per era, built on the knockable-prop physics
status: proposed
priority: P2
size: M
lens: content
created: 2026-10-18
pr:
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
- [ ] Unit: each era resolves a hazard config; spawns are deterministic per seed (daily stays identical)
- [ ] Each hazard is visible ≥ 1 s before contact at 120 mph and always leaves an open lane
- [ ] No new per-frame allocations; e2e perf probe within budget
- [ ] Names and art are original (IP denylist test passes)

## Test plan
`tests/unit/hazards.test.js` (config + determinism + open lane); e2e race in two eras via `__OT`.

## Out of scope
New car models, police AI changes, 3D-only art.
