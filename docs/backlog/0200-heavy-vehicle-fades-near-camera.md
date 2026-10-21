---
id: 0200
title: A heavy vehicle beside the camera must not wall off half the screen
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-21
pr:
---

## Why
Pillar 3 (readability). In a level-1 play-through a grey heavy vehicle slab filled ~40% of
the right of the screen at 1280x720 and the bottom-right at 390x844 (huge wheels, no
detail), hiding traffic and the road edge at 100+ mph. 0192 fixed the same slab on the
title only; in a race it still appears when a van or truck passes the camera.

## What
In the 2D sprite pass (`drawCarAt` / traffic draw in `src/main.js`, car art in
`src/car-sprite.js`), cap the on-screen scale of non-player vehicles below a near-plane
distance and cross-fade their alpha to about 35% as they pass beside the camera, so the
road stays readable. Render-only: never touch sim state (sim/render rule). Honour the
3D view too if it shows the same behaviour.

## Acceptance criteria
- [ ] A vehicle passing at near-plane distance covers no more than 25% of the canvas width and is translucent
- [ ] Collision and takedown behaviour unchanged (unit/e2e sim tests still green)
- [ ] Screenshots at 1280x720 and 390x844 with a forced near-pass show the road edge and traffic ahead
- [ ] Zero new per-frame allocations; perf probe within budget

## Test plan
Pure helper `nearFade(depth)` unit-tested (monotonic, bounds). E2E forces a heavy van beside
the player via the debug hook and asserts the canvas pixel coverage on its side stays under
the cap.

## Out of scope
Changing traffic spawning, lane rules, or van size in the sim.
