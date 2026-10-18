---
id: 0131
title: Physics v3 — gearbox and traction, speed-sensitive brakes, friction circle, air and walls
status: in-progress
priority: P0
size: M
lens: player-feel
created: 2026-10-18
---

## Why
The user asked for physics that is "way better". After the heading/yaw steering (0120) the
pedals were still a cursor: a flat +N mph/s in every gear, −45 mph/s brakes at any speed, a
−18 mph/s lift-off cliff; grip for braking and cornering was separate; you could steer in
the air; walls were a pure bounce.

## What
- `src/drivetrain.js` (pure): six gears on the old shift points with hysteresis, a torque
  curve per gear and an 80 ms cut on every upshift; launches limited by tyre traction
  (`spin` when the engine out-pulls the tyres); brakes that ramp in over 70 ms and bite
  harder at speed; engine braking by gear off throttle. Calibrated so 18→88 mph keeps the
  old time on every pace (race clock, medals and server bounds were tuned on it).
- Friction circle both ways: cornering load shrinks traction and braking; pedal load shrinks
  cornering grip (never below 55%). Weight transfer: braking sharpens turn-in and lets the
  tail step out (trail-braking), throttle pushes a little.
- Airborne: no tyre forces — the yaw rate carries, a touch of air control, no self-aligning;
  landing with the body crooked to the travel direction costs speed.
- Walls: 30% restitution, friction that scrubs speed by impact, a yaw kick away from the
  barrier, and steady scrub while grinding.
- Body roll on a spring from the cornering load.

## Acceptance criteria
- [x] 18→88 within 10% of the old time on ARCADE and TURBO; the launch to 45 is quicker
- [x] Braking 88→20 under 1.6 s; braking mid-corner stops less; never below 18 mph
- [x] Steering in the air does under a quarter of what it does on the road
- [x] A harder wall hit scrubs more speed; the left and right walls mirror
- [x] Deterministic at 120 Hz; the penalty log the server re-checks is unchanged

## Test plan
- Unit: tests/unit/drivetrain.test.js, tests/unit/handling-v3.test.js, existing handling tests
- E2E: the full suite (race, feel, handling, setpieces, live) on the new model
