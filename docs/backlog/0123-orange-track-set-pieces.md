---
id: 0123
title: Orange-track layouts — real curves, hills, loops, corkscrews, gap jumps and half-pipes
status: shipped
priority: P0
size: L
lens: player-feel
created: 2026-10-17
pr: 62
---

## Why
The operator's kids: "we need curves and loops on the track like the orange toy tracks, not just
straight."

## What
- Every level cycles its own book of pieces (`src/track.js`): sweepers, S-bends, banked
  hairpins, blind crests, and set pieces, each led in by a booster gate with a speed sign.
  The pieces are vertical loops, corkscrews, gap jumps and wall-ride half-pipes.
  Level 1 is gentle; level 5 is the full playset. The 5-track count is unchanged.
- `src/setpieces.js`: set-piece numbers and the sim. A booster gate kicks you up to loop speed.
  Stalling in a loop or missing a gap costs time, never points. All of it is deterministic.
- 3D (`src/render3d/path.js`): the road carries a full frame (forward/up/right). Loops are real
  vertical circles that exit beside their entry. Corkscrews roll a full turn on a helix,
  half-pipes and banks tilt the road, and the car and chase cam follow the road's up (calm mode
  keeps the horizon level).
- 2D: the world barrel-rolls through corkscrews and leans up half-pipes, while the car stays put.
  Gaps are real holes. A side-on loop cam (lazy `src/setpieces-2d.js`) shows your car going round
  the orange loop; the clock-face loop in 1955/2026 is listed in docs/EASTER_EGGS.md.
- Hazards and traffic never sit in set pieces (the clean-line planner skips them).

## Done when
- [x] unit: layouts per level, contiguous features, gates before set pieces, 3D frames
  orthonormal, a loop climbs to its top upside down and exits beside its entry, set-piece
  sim deterministic
- [x] e2e (`tests/e2e/setpieces.spec.js`): loop, corkscrew, half-pipe and gap in 2D and 3D,
  no console errors, with screenshots at 390×844, 844×390, 820×1180, 1180×820 and 1280×720,
  and a frame-time probe through curves
