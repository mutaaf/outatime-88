---
id: 0182
title: Steady frames — no per-step garbage in the hot paths, a p95/p99 frame gate
status: in-progress
priority: P1
size: S
lens: performance
created: 2026-10-19
---

## Why
The user: "double down on the best controls and performance". Mid-race the sim and the 2D
renderer rebuilt lists and objects every 120 Hz step or every visible segment, and wrote DOM
120 times a second while drifting. Nothing guarded p95/p99 frame cost or garbage.

## What
- **Sim:** nearest-threat and best-collectible slots are filled in place; the drafting
  check reuses a movers list; sparks come from a pool (swap-remove, no `splice`); the drift
  counter is rewritten about 12×/s or on a new tier, not every step; the ability tint is
  written once when it ends, not every step.
- **Ability tint:** activating ZONE/AGRO now clears the step loop's inline `opacity: 0`, so
  the green and orange tints actually show (they had been hidden).
- **2D render:** each moving car's segment is worked out once per frame. Previously the list
  was rebuilt and every car re-tested on every visible segment, about 150 arrays and 5k
  checks a frame. The visible-segment list is reused. Booster rollers use a plain loop.
  Speed-line colours come from a 50-step cache. The full-screen clear before the final blit
  is skipped unless the camera is shaking, since the blit covers every pixel.
- **Gate:** a new e2e, `tests/e2e/frames.spec.js`, covers 2D and 3D. It asserts the game's
  own per-frame JS at p95 and p99 (the worst of three windows is dropped), and garbage in
  MB/s from V8's sampling heap profiler, which doesn't depend on runner speed.

## Findings
A CPU profile of a 2D race on headless Chromium shows `drawImage` at 53% of samples and GC at
0.3%. The final upscale blit is software-rastered there, which is not representative of
phones, where canvas is GPU-rastered. So garbage isn't the frame-time problem on CI. The gains
here are fewer JS spikes and fewer GC pauses on real phones. The governor (0041) already
steps quality down when p95 runs over budget (`mobile.spec`, slow phone), and the sim already
steps at 120 Hz, so 120 Hz screens get one sim step per frame.

## Acceptance criteria
- 2D and 3D game JS stays under p95 24/16 ms and p99 36/28 ms, and garbage under 14 MB/s,
  mid-race (e2e).
- No behaviour change: race, feel, props, rivals, live, runner and mobile e2e pass.

## Test plan
- E2E: `frames.spec.js`, plus the specs above.
