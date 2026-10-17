---
id: 0074
title: Every object has its own physics — static trees, knockable cones and barrels, sleeping props
status: shipped
priority: P1
size: L
lens: performance
created: 2026-10-17
pr: 38
---

## Why
All obstacles shared one generic body, so a pine tree went flying like a crate, and the
world was solved all-pairs with fresh arrays every sub-step. The user asked for "realistic
physics per object" that stays performant.

## What
- `src/materials.js`: a material per type (mass, restitution, friction, static/knockable,
  damage, penalty kind) and `impactVelocities()` (1-D impulse exchange that conserves
  momentum). Trees are static (infinite mass): you bounce off, they never move.
- New props: traffic cones (4 kg) and oil barrels (95 kg), spawned as cone lines, cone gates
  and barrel huddles (`trafficRand`, so dailies stay deterministic). Hitting one is a real
  momentum exchange: a cone flies off at ~1.9× your speed and costs you ~0.5 % speed and a
  small CONE penalty (no HP); a barrel takes ~12 % speed and 4 HP. Props tumble, bounce,
  roll to a stop (rolling friction) and fall asleep. Drawn in both 2D and 3D.
- `src/broadphase.js`: 1-D spatial hash on track Z (sorted cells, reused arrays).
- `src/world.js`: the world step carved out of main.js — integrate awake bodies, broadphase
  pairs, impulse/MTV solver (unchanged for cars and the classic obstacles), sleeping props,
  and a fixed 24-prop pool that recycles the furthest-behind prop instead of allocating.
- `RigidBody3D`: `reset()` for pooling, static bodies, sleep/wake. Obstacles are recycled in
  place; the per-step `concat`/`map` allocations in LiveTraffic are gone.
- Scoring: a `cone` penalty kind (800 + 12 × mph), validated by the Worker like the others
  (older clients without a cone list still accepted).

## Acceptance criteria
- [x] Momentum conserved, energy never grows; static bodies never move
- [x] Broadphase finds exactly the all-pairs contacts while testing >10× fewer pairs
- [x] 210 bodies step in well under 1 ms per 1/120 s step (measured ~0.09 ms locally)
- [x] Props settle and sleep; the pool never grows
- [x] Perf probe still 60 fps; main bundle under 60 kB gz
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/world.test.js` (materials, impulse maths, static tree, sleep/wake, broadphase vs
brute force, pool cap, 210-body benchmark, sleeping cuts work) and `tests/e2e/props.spec.js`
(a cone in your path is knocked flying, costs a cone penalty and no HP, then sleeps; a long
race stays within the pool).

## Out of scope
Full 2-D (lateral + longitudinal) contact manifolds; cones bumping each other use the same
pair solver as everything else.
