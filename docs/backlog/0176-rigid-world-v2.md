---
id: 0176
title: Rigid world v2 — real per-object physics for traffic, rivals, wrecks and props
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-19
pr: 0
---

## Why
"Way better physics engine per object, realer." The 0074 world was a step up from scripted
bumps, but every hit was an axis-aligned shove with hand-tuned kicks: cars never really spun, a
semi and a sedan pushed each other almost the same amount, traffic and rivals had their speed
overwritten every frame so a shunt was forgotten at once, and a wall was a clamp.

## What
- `src/rigid.js`, its own lazy chunk (~4.2 kB, fetched in parallel with the race step):
  - every body is an oriented box with real mass, yaw inertia from its footprint, roll inertia
    from its width and height, and a centre of mass from its car shape (src/car-shapes.js);
  - separating-axis contacts, so a car spun sideways is hit on its flank;
  - sequential impulses at the contact point (4 passes): momentum is conserved, energy never
    grows, heavier cars shove lighter ones, an off-centre hit spins a car by its yaw inertia,
    and Coulomb friction between the bodies drags the faster one back;
  - walls are static planes with restitution and friction: hit one and you slide along it;
  - drivers: a car is driven at its target speed until a big hit (~5 mph of change) takes it
    out of the driver's hands; then it's only tyres (skid, spin down, scrub speed) until the
    driver catches it and countersteers back; a car nosed into something brakes to its speed,
    or slows and steers round a fixed obstacle, instead of shoving it down the road;
  - traffic cruise control eases back after a shunt, so a car you push keeps the push;
  - wrecks tumble with real angular momentum and settle back on their wheels; props slide to a
    stop (Coulomb) and sleep;
  - deterministic: no randomness and stable pair order, with a world hash for replay tests.
- Rival AI speed is whatever the physics leaves it with, so a shunted rival has to recover.
- Your hits on rivals and traffic go through the same impulses (src/handling.js still owns your
  own tyres): rear corners spin cars (a real PIT), door-to-door hits split by mass, and a hit
  kicks your yaw so handling has to catch it. Takedowns are a ram at three times your mass.
- Barrier launches come from the momentum exchange at the point your bumper met them.
- 3D shows a car's full yaw, so spins read.

## Acceptance criteria
- A semi drifting into a sedan throws it across the road and barely slows.
- Hitting a car's rear corner spins it; a square hit doesn't.
- A car hitting a wall at an angle slides along it and loses some speed.
- A wreck tumbles, lands and settles on its wheels; a knocked cone slides to a stop and sleeps.
- The same inputs replay to the same world hash.
- Main doesn't grow; the race step stays under 23 kB; the rigid chunk under 5 kB.

## Test plan
- `tests/unit/rigid.test.js`: momentum and energy, semi vs sedan, PIT spin, wall slide, driver
  loss and recovery, wreck settle, cone sleep, static trees, replay hash.
- `tests/e2e/rigid.spec.js`: the semi shove and the wreck settle in a real race.
- `tests/e2e/budget.spec.js`: the rigid chunk's budget; the existing props, rivals, penalty and
  perf specs still pass.
