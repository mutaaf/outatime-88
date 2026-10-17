---
id: 0100
title: Real 2D worlds — layered era backdrops packed with pop-culture easter eggs
status: shipped
priority: P1
size: L
lens: content
created: 2026-10-17
pr: 0
---

## Why
The operator: "the game needs way more realistic 2d backgrounds levels that are fully immersed
in pop culture easter eggs and references". Every 2D era drew the same gradient, sun, ridge,
box city and one landmark, so time travel didn't feel like it went anywhere.

## What
- `src/scenes/s<era>.js`: one lazy scene per era (2026, 1985, 1885, 2015, 2088, 1955). Each
  paints a sky + ground plate and three parallax layers (far / mid / near) once per era ×
  canvas size: atmospheric haze toward the horizon, lit windows, signage, era props, and a
  wet-street reflection of the mid layer where it rains.
- `src/scenes/stage.js` (lazy): loads scenes, caches their layers, scrolls them with the
  road's curvature and the player's steer, and runs each scene's live set pieces (neon,
  searchlights, hover traffic, trains, flare stacks, rain/dust) with zero per-frame
  allocation. `src/backdrop.js` is the only part in the main bundle: a shim plus a flat
  two-tone fallback for the first frames.
- `src/scenes/eggs.js`: pure easter-egg triggers (warp, 88 mph, final lap, race clock).
- Roadside billboards carry each era's own ads.
- The full list of nods, where they are and why each is safe: `docs/EASTER_EGGS.md`.

## Acceptance criteria
- [x] Every era renders a distinct, layered world with no console errors at phone and tablet
  sizes in both orientations (`tests/e2e/backdrops.spec.js`, screenshots attached).
- [x] Backdrop costs < 4 ms/frame under SwiftShader (measured 0.2–0.3 ms).
- [x] Main bundle does not grow (the old backdrop code moved out); scenes are lazy chunks with
  their own budget (`tests/e2e/budget.spec.js`); the service worker precaches them.
- [x] Calm motion: no lightning flash, no strobing; set pieces still appear, steady.
- [x] Every egg trigger is unit-tested (`tests/unit/eggs.test.js`).

## Test plan
- `tests/unit/eggs.test.js`: every trigger (warp lightning, 88 mph sparks/fireworks, final-lap
  one-shots, pines after lap 1, shark/rain timings), no per-frame allocation of the result.
- `tests/e2e/backdrops.spec.js`: all six eras at 390x844, 844x390, 820x1180, 1180x820 (horizon
  detail, no console errors, screenshots attached, < 4 ms/frame); a forced warp moves the scene on.
- `tests/e2e/budget.spec.js`: scene chunks stay lazy and in budget.
- Manual: screenshots of every era on production after deploy.

## Out of scope
- The 3D mode keeps its own world (src/render3d).
- New levels: the five tracks keep their start eras (live rooms and the leaderboard validate
  `LEVEL_COUNT = 5`), and LVL 5 already warps through all six worlds.
