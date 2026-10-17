---
id: 0041
title: Device-adaptive graphics tiers, a quality governor, and a realistic 3D view
status: in-progress
priority: P1
size: L
lens: performance
created: 2026-10-17
pr:
---

## Why
The operator: "3d is not realistic enough also make sure we use webgl or gpus if available and
make everything more efficient and smart based on what we have available spec wise." One fixed
quality level is too much for a budget phone and too little for a desktop GPU.

## What
- `src/perf/`: capability probe → LOW/MEDIUM/HIGH/ULTRA, cached per device; a governor that
  trades resolution, then effects, then draw distance for frame time, with hysteresis.
- Settings → GRAPHICS (AUTO + four tiers), `?gfx=` override, `?debug` overlay.
- 2D: the road buffer scales with the governor (absorbs ticket 0031); the sim never sees it.
- 3D: PBR materials, ACES tone mapping, a procedural sky environment, tiered sun shadows,
  procedural asphalt, per-archetype cars with spinning/steering wheels and brake lights,
  era fog, particles, bloom/AA/vignette on HIGH/ULTRA, a livelier chase camera.

## Acceptance criteria
- [x] Unit: tier mapping, cached-tier resolution, presets monotonic, governor steps down after two slow windows, waits (doubling) before stepping up, never flaps, demotes at the floor
- [x] e2e: auto picks LOW on a software GPU; forced LOW and ULTRA race in 3D without errors under their draw-call ceilings; Settings → GRAPHICS switches live and persists
- [ ] 3D realism pass (PBR/IBL/shadows/cars/post) with per-tier screenshots
- [ ] Measured tier table in docs/PERF.md

## Test plan
`tests/unit/gfx.test.js` (tiers, presets, governor), `tests/e2e/gfx.spec.js` (auto tier,
forced tiers under draw-call ceilings, settings), `tests/e2e/mode3d.spec.js` unchanged.

## Out of scope
WebGPU rendering (see docs/PERF.md: WebGL2 stays the backend), changing the simulation per tier.
