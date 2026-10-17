---
id: 0004
title: Carve track generation out of main.js into src/track.js
status: shipped
priority: P1
size: M
lens: tech-health
created: 2026-10-16
pr: 13
---

## Why
`src/main.js` is still ~3.9k lines. Track generation (`segments`, `generatedCount`,
`addSegment`, `addRoadSection`, `populateChunkDecorations`, `generateNextTrackBiome`,
`initTrack`) is a cohesive system with no rendering in it. Isolating it makes it testable
(determinism, no all-lanes-blocked patterns) and gives future content tickets a clean home.

## What
Move those functions into `src/track.js`. Because module bindings are read-only (see LESSONS),
expose the segment list as a mutable container (e.g. `export const track = { segments: [], generatedCount: 0 }`)
and update call sites. Zero behaviour change.

## Acceptance criteria
- [x] `src/track.js` exists; `main.js` no longer defines the moved functions
- [x] `npm run lint` passes (no undefined identifiers left behind)
- [x] New unit tests: generating N biomes yields monotonically increasing segment z and every obstacle row leaves at least one lane open
- [x] All existing e2e tests pass unchanged

## Test plan
`tests/unit/track.test.js` imports the module in node (stub `document` only if needed) and
asserts the invariants above over 20 generated biomes.

## Out of scope
Changing track layouts or difficulty.
