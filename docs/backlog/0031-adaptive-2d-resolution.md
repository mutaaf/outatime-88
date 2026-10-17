---
id: 0031
title: Adaptive 2D render resolution so phones hold 60 fps (3D already scales; 2D does not)
status: shipped
priority: P2
size: M
lens: performance
created: 2026-10-17
pr: 52
---

## Why
Invariant 4 (frame budget on a recent phone). `resizeCanvases()` in `src/main.js` sizes the
2D canvas 1:1 with CSS pixels with no scaling hook, while the 3D view already has adaptive
resolution (`src/render3d/view.js`). On a big tablet or a slow phone the 2D path, the default
mode, can't trade resolution for frame time, and the pixel-art look tolerates a lower internal
resolution well. Technique: dynamic resolution scaling from a rolling frame-time average,
https://web.dev/articles/optimize-long-tasks (frame budget framing) and the existing 3D logic.

## What
Add a pure `src/resolution-scaler.js` (rolling average of frame ms → scale in {1, .85, .7, .6},
hysteresis so it never flaps) and apply it in `resizeCanvases()` by setting the canvas
backing size while CSS keeps full size. Reuse the 3D scaler's thresholds. Reduce-only on
slow frames; recover after 2 s of headroom. Never changes sim, only backing resolution.

## Acceptance criteria
- [ ] Unit: scale drops after sustained slow frames, recovers after sustained fast ones, and never changes more than once per second
- [ ] e2e perf probe with a throttled CPU shows a scale < 1 and the page still renders (screenshot non-blank)
- [ ] Looks identical at scale 1 (existing screenshots unchanged); no layout shift
- [ ] No per-frame allocations added

## Test plan
`tests/unit/resolution-scaler.test.js`; add a CPU-throttled case to `tests/e2e/perf.spec.js`
via CDP `Emulation.setCPUThrottlingRate`.

## Out of scope
Switching renderers, changing the 3D scaler.
