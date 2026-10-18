---
id: 0124
title: Orange-track layouts — real curves, hills, loops, corkscrews, gap jumps and half-pipes
status: shipped
priority: P0
size: L
lens: player-feel
created: 2026-10-17
pr: 64
---

## Why
The operator's kids: "we need curves and loops on the track like the orange toy tracks, not just
straight."

## What
- Every level cycles its own book of pieces (`src/track.js`): sweepers, S-bends, banked
  hairpins, blind crests, and set pieces, each led in by a booster gate with a speed sign.
  The pieces are vertical loops, corkscrews, gap jumps and wall-ride half-pipes.
  Level 1 is gentle; level 5 is the full playset. The 5-track count is unchanged.
- `src/setpieces.js`: set-piece numbers and the sim. A booster gate tops you up to the speed
  the next piece needs (for a loop: what clears the top under handling's loop gravity, on the
  slowest pace). Missing a gap costs time, never points. All of it is deterministic.
- 3D (`src/render3d/path.js`): the road carries a full frame (forward/up/right). Loops are real
  vertical circles that exit beside their entry. Corkscrews roll a full turn on a helix,
  half-pipes and banks tilt the road, and the car and chase cam follow the road's up (calm mode
  keeps the horizon level).
- 2D: the world barrel-rolls through corkscrews and leans up half-pipes, while the car stays put.
  Gaps are real holes. A side-on loop cam (lazy `src/setpieces-2d.js`) shows your car going round
  the orange loop; the clock-face loop in 1955/2026 is listed in docs/EASTER_EGGS.md.
- Hazards and traffic never sit in set pieces (the clean-line planner skips them).

## Acceptance criteria
- [x] every level has real curves (|curve| ≥ 1.5), hills and its set pieces within a lap of biomes
- [x] each loop, corkscrew and half-pipe is led in by a booster gate; each gap follows a ramp
- [x] 3D frames stay orthonormal; a loop is upside down at its top and exits beside its entry
- [x] a gate's speed clears every loop under the real loop physics (0123) on every pace; missing a gap costs time, never points; deterministic
- [x] 2D and 3D drive through a loop, corkscrew, half-pipe and gap with no console errors
- [x] works at 390x844 touch and 1280x720, plus 844x390, 820x1180 and 1180x820

## Test plan
Unit: `tests/unit/track.test.js` (layouts, contiguous features, gates, `hasSetPieceBetween`),
`tests/unit/track-path.test.js` (3D frames, loop geometry, corkscrew roll, banks),
`tests/unit/setpieces.test.js` (booster kick, loop fail, gap, view roll, determinism).
e2e: `tests/e2e/setpieces.spec.js` (drive-throughs in 2D/3D, screenshots at five sizes,
frame-time probe through curves).

## Out of scope
Car physics in loops (handling owns it: 0123 loop physics); new tracks (still 5).
