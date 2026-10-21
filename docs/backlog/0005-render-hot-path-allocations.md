---
id: 0005
title: Remove per-frame allocations from renderScene's hot path
status: shipped
priority: P2
size: M
lens: performance
created: 2026-10-16
pr:
---

## Why
`renderScene()` allocates every frame: four canvas gradients (sky, sun halo, sun, ground)
and a fresh `visibleSegments = []` array, plus object literals per projected point. On phones
this feeds the GC and causes hitches at exactly the high-speed moments that matter. AGENTS.md
invariant 4 forbids per-frame allocation in hot paths.

## What
Note: ticket 0009 added `src/fx.js` with a fixed particle pool — reuse that pattern (and migrate
`GameState.debrisShards` / `hitShockwaves` onto pools) rather than inventing a new one.

Cache gradients and rebuild them only when canvas size, horizon, or era changes. Reuse a
preallocated `visibleSegments` array (reset `length`), and pool projected-point objects.
Pixel output must stay identical.

## Acceptance criteria
- [ ] Gradients created only on resize/era change (unit or e2e counter via a wrapped `CanvasRenderingContext2D.prototype.createLinearGradient` shows 0 calls per steady-state frame)
- [ ] Screenshot of frame N matches before/after within a small pixel tolerance
- [ ] Perf probe no worse than `docs/PERF.md` baseline; record the new reading

## Test plan
`tests/e2e/perf.spec.js` gains a case that wraps gradient constructors via `addInitScript`,
races for 2s, and asserts zero gradient creations over the last 60 frames.

## Out of scope
Switching renderer to WebGL.
