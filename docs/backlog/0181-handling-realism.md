---
id: 0181
title: Handling you can read — a progressive tyre limit, weighted transfer, catchable slides
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr: 103
---

## Why
The user: "double down on the best controls and performance to make it realistic". The
handling model (0120, 0131) already had a yaw model, a friction circle and weight transfer, but
the tyres hit their limit like a wall (linear right up to a hard clamp), weight moved with the
pedal instantly, counter-steering a slide flung the tail the other way, and every era's road
gripped the same. The 2D chase cam also stared straight down the road through every bend.

## What
- **Tyre curve (Pacejka-lite)**, `tyreCurve()` in `src/handling.js`. Below 75% of grip, you get
  exactly what you ask for. From there the delivered yaw rounds smoothly to the peak, and past
  1.25× it falls to a 90% slide level. So `slip` builds up gradually instead of all at once,
  and overdriving a bend gives you *less* turn; ease off the wheel and the grip returns.
- **Weight transfer follows the chassis.** `stepLateral` takes `weight` (the chassis pitch,
  + = nose down). Brake turn-in, trail-brake rotation and throttle push now build over about
  0.1 s as the body pitches, instead of switching with the pedal. Lifting off gives a hint of
  lift-off rotation.
- **Counter-steer catches a slide.** Steering against the car's rotation shrinks the tail-out
  angle, and by 0.5 lock it's gone. Hold it longer and the rotation itself reverses, like a real
  pendulum.
- **Surface grip.** Each era's road has a `grip` value in `ERAS`: the dusty 1885 canyon is 0.9,
  and the wet-look neon streets are 0.96. It affects lateral grip only, so speeds, race times
  and the server's bounds don't move.
- **Look into the corner (2D).** The chase cam turns toward the curvature ahead and toward the
  car's yaw, by up to 4.5% of the screen width, eased. It works by shifting the projection's
  centre line, so the road, the cars, the props and your car all move together. It's off
  through loops and corkscrews and under reduced motion. (The 3D cam already aims at a point
  down the road.)

## Acceptance criteria
- The tyre curve is linear to 0.75, monotonic and concave to the peak, and falls past it
  (unit).
- Slip rises continuously as the wheel is swept through the limit, and easing off when
  overdriven turns the car more (unit).
- Nose-down pitch sharpens turn-in and loosens the tail, and nose-up pushes (unit). With no
  pitch yet, there's no extra rotation.
- A quick counter-steer shrinks a drift's tail-out by at least 25% without flinging it across
  (unit).
- Everything is deterministic. All existing handling, steering, set-piece and feel e2e pass.

## Test plan
- Unit: `tests/unit/handling-v4.test.js`, plus the existing handling and handling-v3 tests (the
  floor test now allows for the tyres' slide level).
- E2E: the full desktop suite.
