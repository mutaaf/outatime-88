---
id: 0287
title: Rename the legacy POP_CULTURE_ROSTER identifier to ROSTER (no string or save changes)
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-19
pr:
---

## Why
Invariant 7 says legacy homage names are debt being replaced. The roster's visible names
are already original (0001), but the code still calls it `POP_CULTURE_ROSTER` (64 uses in 10
`src/` files and 7 unit tests), which advertises the opposite of the product's identity to
every contributor and agent that reads the source, and `MULTIVERSE_POOL` likewise. Renaming
an identifier is mechanical, behaviour-free and lint-checkable.

## What
Rename the exports `POP_CULTURE_ROSTER` to `ROSTER` and `MULTIVERSE_POOL` to `CAR_POOL` in
`src/data.js` and every importer (`src/main.js`, `race-step.js`, `race-flow.js`, `home.js`,
`share-ui.js`, `render/scene.js`, `render/player.js`, `render3d/meshes.js`, `live/controller.js`,
`live/thumbs.js`, the unit tests). Do not change any id, string, key or saved value
(the save key and `garage` ids are untouched, invariant 6). Update AGENTS.md and docs if
they mention the old names.

## Acceptance criteria
- [ ] `grep -rn "POP_CULTURE_ROSTER\|MULTIVERSE_POOL" src tests scripts` returns nothing
- [ ] `npm run lint` (no-undef) and the full unit suite green with no test edited except for the identifier
- [ ] Main startup JS is not larger than before (identifiers minify away; check `budget.spec.js`)
- [ ] Built bundle behaves identically: boot smoke and garage e2e green

## Test plan
Existing suites prove nothing dangles; add a unit assertion in `tests/unit/ip-denylist.test.js`
that the denylist also scans identifiers in `src/` for "POP_CULTURE".

## Out of scope
Renaming ids, display strings or any save field.
