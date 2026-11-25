---
id: 0306
title: Give main.js headroom: move race-only missions, ghost and leaderboard glue behind the race chunks
status: shipped
priority: P2
size: M
lens: tech-health
created: 2026-11-25
pr: 317
---

## Why
Pillar 7 and the 0223/0285 lessons: new features ship lazy, but main's startup bundle is
~55.7 kB gzipped against a 57 kB budget, so the next hook that needs a few hundred bytes fails
`budget.spec.js` and a Builder has to go hunting (0294 and 0297 both did). main.js statically
imports modules the title does not need on its first frame: `./missions.js` (~1.2 kB gz),
`./ghost.js` (~2.0 kB) and `./leaderboard.js` (~1.6 kB: run tokens, ghost fetch). Race-only
modules belong in the race chunks and are imported there directly (AGENTS.md § Budgets).

## What
For each of the three, find every use in `src/main.js`. Where the use is only inside the race
(mission advance/record, ghost recorder, `beginRun`/`fetchGhost`), import the module directly from
`race-step.js`, `race-flow.js` or `race-late.js` (whichever has room: race-step ≤ 23 kB, race-flow
≤ 9 kB) and reach it from main through the existing `RS`/`RF` hooks. Where the title needs a value
(`titleMissionLine`, `normalizeInitials`), keep that small pure helper in main or give it its own
import-free lazy chunk. One module per commit; no behaviour change (carving rule, AGENTS.md § System
map). Stop when main is ≥ 2 kB under budget or a move does not fit; record the new numbers in the
budget paragraph of `AGENTS.md`.

## Acceptance criteria
- [ ] main's startup gzip drops by ≥ 2 kB (same method as `tests/e2e/budget.spec.js`; compare against a build of main's own tree, per the 2026-11-21 lesson)
- [ ] `budget.spec.js` green with every lazy chunk inside its limit; no new chunk in main's preload map
- [ ] `npm run lint` passes; missions, ghost recording and run-token posting still work (existing missions, ghost and leaderboard specs)
- [ ] AGENTS.md budget numbers updated

## Test plan
Existing e2e and unit tests are the proof (no behaviour change). Add one e2e assertion that the
title loads without fetching the moved chunks before the first race starts, so the carve cannot
regress.

## Out of scope
Raising the budget, touching `src/worker/`, re-architecting `RACE_DEPS`.
