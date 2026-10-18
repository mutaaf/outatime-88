---
id: 0026
title: Three missions per run — surface the hidden street contracts as goals you can see
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 73
---

## Why
Depth pillar (operator: "more complexity"). `CONTRACT_TEMPLATES` already tracks takedowns,
drift points, warps, near-miss chains and slipstream, but its HUD bar is hidden, so players
never see a goal beyond "score". Casual runners (Subway Surfers missions, Tag with Ryan
quests) keep runs varied with three small visible objectives and a reward for finishing.

## What
- `src/missions.js` (pure): pick 3 distinct contract types per run (seeded by the daily
  spec on daily runs), track progress from the existing `advanceContractProgress` calls,
  report completions.
- Title: one line under PLAY ("3 MISSIONS · 1/3 DONE TODAY"). In-race: a completion goes
  through the announcer only (no new HUD row). Results: the three missions with ✓/progress
  and the flux cash earned.
- Persist completed-today count in `SaveStore.data` (new default field, invariant 3.6).

## Acceptance criteria
- [x] Unit: three distinct missions per run; progress and completion; daily runs get the same
      three for everyone
- [x] e2e: results show three missions; a completed one shows ✓ and its reward
- [x] Zero-overlap layout e2e still green at all viewports (no new HUD element in-race)
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/missions.test.js`; extend `tests/e2e/ladder.spec.js` or a new `missions.spec.js`
using `__OT.finishRun()`.

## Out of scope
Mission chains, season passes, anything that needs the server.
