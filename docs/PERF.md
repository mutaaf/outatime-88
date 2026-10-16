# Performance baseline

Updated by the Keeper. The e2e perf probe (`tests/e2e/perf.spec.js`) logs the average
`requestAnimationFrame` interval over 120 frames mid-race.

| Date | Env | Avg frame (ms) | FPS | JS gz | CSS gz | Notes |
|---|---|---|---|---|---|---|
| 2026-10-16 | Local headless Chromium (Apple Silicon, SwiftShader) 1280x720 | 16.67 | 60.0 | 34.0 kB | 17.2 kB | Baseline after port. Headless is vsync-capped at 60, so the probe catches only large regressions; investigate any reading over 20 ms locally. |
