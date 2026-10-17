---
id: 0120
title: Organic handling — keys ramp the wheel, speed-sensitive lock, grip-limited cornering
status: in-progress
priority: P0
size: M
lens: player-feel
created: 2026-10-17

---

## Why
Playtest on a laptop: "steering is weird". Keys set full lock instantly and the car slid
sideways at a fixed rate like a cursor (peak lateral jerk ~1,900 half-widths/s³ at 80 mph). Steering
didn't depend on speed, weight or grip, and corners only nudged the car.

## What
- `src/handling.js` (pure, deterministic, unit-tested):
  - **Steering:** keys ramp toward lock (4.2 lock/s, so a tap nudges and a hold builds to
    full lock in about 0.22 s). Release returns at 8 lock/s and the opposite key counter-steers
    at 13 lock/s. Lock shrinks with speed (≈0.72 at 80 mph, 0.62 at 105). Stick, tilt, wheel
    and touch go through the same lock with 30 ms smoothing.
  - **Lateral:** tyres chase the asked-for sideways speed, limited by grip. Grip scales with
    the roster's grip rating, tyre upgrades, √mass, downforce, and brake/throttle weight
    transfer. Corners pull outward ∝ curve·v², and banking cancels part of the pull. Past grip
    the car slides (`GameState.tyreSlip`) and that counts as a drift.
- Drift no longer starts by itself on sharp curves: it's brake + steer, or the tyres actually
  sliding.

## Acceptance criteria
- [x] A 60 ms tap moves the car ~0.02 half-widths; a 0.5 s hold builds smoothly (no jumps)
- [x] Lock shrinks with speed; a power drift gives full lock back
- [x] Too fast for a corner slides wide; banking helps; heavy/low-grip cars respond slower
- [x] Same inputs give the same result (no randomness or wall clock in the model)

## Test plan
- Unit: `tests/unit/handling.test.js`
- e2e: `tests/e2e/handling.spec.js` (tap vs hold on the real keyboard path, monotone ramp,
  bounded lateral acceleration in sim time)
