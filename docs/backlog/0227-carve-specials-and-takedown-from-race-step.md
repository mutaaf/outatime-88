---
id: 0227
title: Carve the street-crew specials and rival takedown out of race-step.js
status: ready
priority: P2
size: M
lens: tech-health
created: 2026-10-30
pr:
---

## Why
`src/race-step.js` is 2,111 lines and the chunk is at ~22.4/23 kB gz, so every race feature
now fights for bytes. Pillar 7: keep carving. `triggerRivalTakedown`, `activateMidnightSpecial`
and `fireUnibeam` (lines ~530-673) are a cohesive system with a narrow interface.

## What
Move those functions (and their private helpers) into `src/race-specials.js`, imported only by
`race-step.js` so it merges into the same chunk (see LESSONS 2026-10-28 on shared chunks). No
behaviour change in the same PR. Update the AGENTS.md system map.

## Acceptance criteria
- [ ] `race-step.js` shrinks by ≥ 150 lines; the new module has explicit imports and passes `npm run lint`
- [ ] Main startup JS and `race-step-*.js` gzip sizes are not larger than before (log both)
- [ ] A unit test exercises takedown and each special through the new module's exports
- [ ] Full e2e gate green; no new lazy chunk appears in the build output

## Test plan
Unit test in `tests/unit/race-specials.test.js` plus the existing takedown/special e2e specs unchanged.

## Out of scope
Splitting `updateGame` itself; any tuning change.
