---
id: 0011
title: Campaign ladder with medal targets, unlocks and local best times per level
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-16
pr: 7
---

## Why
Pillar 5. Levels exist but a run ends with a score and nothing to chase. A short ladder —
bronze/silver/gold score targets per level, the next level unlocking on bronze, and your best
score/time shown on each card — gives every run a goal and a reason to replay.

## What
`src/progress.js` (pure): medal thresholds per level, `medalFor(levelId, score)`,
`applyRunResult(save, result)`. New save fields added with defaults per invariant 6 (never
rename the key). Level cards show medal + best; results modal shows medal earned and next
target.

## Acceptance criteria
- [ ] Unit tests for `medalFor` boundaries and `applyRunResult` (best only increases; unlock on bronze)
- [ ] Migration unit test: an old-shape save (no progress fields) loads and gains defaults
- [ ] e2e: finishing a run updates the level card's best value after reload
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/progress.test.js`, `tests/unit/save.test.js` migration case, e2e in `smoke.spec.js`.

## Out of scope
Online leaderboards (no servers).
