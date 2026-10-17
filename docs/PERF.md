# Performance baseline

Updated by the Keeper. The e2e perf probe (`tests/e2e/perf.spec.js`) logs the average
`requestAnimationFrame` interval over 120 frames mid-race.

| Date | Env | Avg frame (ms) | FPS | JS gz | CSS gz | Notes |
|---|---|---|---|---|---|---|
| 2026-10-16 | Local headless Chromium (Apple Silicon, SwiftShader) 1280x720 | 16.67 | 60.0 | 34.0 kB | 17.2 kB | Baseline after port. Headless is vsync-capped at 60, so the probe catches only large regressions; investigate any reading over 20 ms locally. |
| 2026-10-17 | Local headless Chromium, real GPU (Apple M1 Max via ANGLE Metal), 3D view mid-race | 16.6–17.0 | 55–60 | 45.4 kB + 3D chunk 153.5 kB | 19.5 kB | 3D mode (0040) at 1280x720@1x, 1024x1366@2x, 1366x1024@2x, 390x844@3x: vsync-capped 60 fps, 93 draw calls, ~10.5k triangles, DPR capped at 1.5 (adaptive down to 0.6 if frames run > 22 ms). SwiftShader (CI) runs the 3D view at ~20–23 ms with DPR adapted to 0.7–0.85. |
