# Performance baseline

Updated by the Keeper. The e2e perf probe (`tests/e2e/perf.spec.js`) logs the average
`requestAnimationFrame` interval over 120 frames mid-race.

| Date | Env | Avg frame (ms) | FPS | JS gz | CSS gz | Notes |
|---|---|---|---|---|---|---|
| 2026-10-16 | Local headless Chromium (Apple Silicon, SwiftShader) 1280x720 | 16.67 | 60.0 | 34.0 kB | 17.2 kB | Baseline after port. Headless is vsync-capped at 60, so the probe catches only large regressions; investigate any reading over 20 ms locally. |
| 2026-10-17 | Local headless Chromium, real GPU (Apple M1 Max via ANGLE Metal), 3D view mid-race | 16.6–17.0 | 55–60 | 45.4 kB + 3D chunk 153.5 kB | 19.5 kB | 3D mode (0040) at 1280x720@1x, 1024x1366@2x, 1366x1024@2x, 390x844@3x: vsync-capped 60 fps, 93 draw calls, ~10.5k triangles, DPR capped at 1.5 (adaptive down to 0.6 if frames run > 22 ms). SwiftShader (CI) runs the 3D view at ~20–23 ms with DPR adapted to 0.7–0.85. |
| 2026-10-17 | Local headless Chromium (Apple Silicon, SwiftShader) 1280x720 + Vitest bench | 16.67 | 60.0 | 57.8 kB | 22.9 kB | Ticket 0074: world step for 210 bodies (200 props + 10 cars, a third in motion) = 0.09 ms per 1/120 s step (2 sub-steps); broadphase tests ~840 pairs per sub-step instead of 21,945 all-pairs. Settled props sleep (0 awake after 1 s). |
| 2026-10-17 | Local headless Chromium (Apple Silicon, SwiftShader), backdrop probe at 390x844 / 844x390 / 820x1180 / 1180x820 | — | — | 59.1 kB + era scenes ~17 kB | — | Ticket 0100: the layered era backdrop costs 0.18–0.32 ms per frame (smoothed, `__OT.backdrop().ms`): a sky plate plus three cached parallax layers blitted (≤ 7 drawImage calls) and a few dozen fillRects for live details. Layers paint once per era × canvas size, capped at ~1100 px per screen width. |
| 2026-10-17 | Local headless Chromium, real GPU (Apple M1 Max, ANGLE Metal) and SwiftShader, 3D mid-race, era 1885 | see tier table | — | 59.2 kB + 3D chunk 149.9 kB | — | Ticket 0041: graphics tiers + PBR road, era IBL, shadows. Tier table below. |

### Graphics tiers (ticket 0041), measured 2026-10-17

M1 Max (real GPU), 3D mid-race, 60 Hz headless (vsync-capped, so fps reads 60 when under budget):

| Tier | DPR cap | Shadows | Env light | Draw distance | 390x844@2x draws / tris | 1180x820@2x draws / tris | fps / p95 |
|---|---|---|---|---|---|---|---|
| LOW | 1.0 | off | off | 120 seg | 111 / 10.5k | 105 / 10.9k | 60 / 16.8 ms |
| MEDIUM | 1.25 | 1024 PCF | PMREM | 160 seg | 125 / 17.4k | 144 / 18.0k | 60 / 16.7 ms |
| HIGH | 1.5 | 2048 soft | PMREM | 190 seg | 158 / 19.0k | 148 / 19.2k | 60 / 16.8 ms |
| ULTRA | 2.0 | 2048 soft | PMREM | 240 seg | 167 / 21.7k | 182 / 24.1k | 60 / 16.8 ms |

SwiftShader (software, what CI runs; auto picks LOW): 1280x720 settles at governor step 2
(DPR 0.85), ~35 fps, p95 33 ms — the governor is doing its job on a device that can't hold 60.
Draw-call ceilings per tier (`maxDraws`, enforced by `tests/e2e/gfx.spec.js`): 125 / 150 / 190 / 230.
