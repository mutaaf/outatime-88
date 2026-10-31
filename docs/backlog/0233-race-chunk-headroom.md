---
id: 0233
title: Free ~1.5 kB gz of headroom in the race-step and race-flow chunks so the next race features fit
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-10-31
pr:
---

## Why
Measured on current `main` (`npm run build`, gzip -9, kB = 1024 as `tests/e2e/budget.spec.js` computes it): `race-step-*.js` 23,073 B = 22.5 kB of its 23 kB limit, `race-flow-*.js` 8,998 B = 8.79 kB of 9 kB. That is ~470 B and ~220 B of room. docs/LESSONS.md already records a ~370 B DOM change tipping race-flow over, and a pure carve costing +165 B in race-step (0227). Every future race feature (0231 included) will hit the wall and the Builder will end up raising a budget instead of making room. 0223 did this for main and was the right move.

## What
Find 1.5 kB gz of savings across the two chunks without changing behavior: dead branches and unreachable legacy paths in `src/race-step.js` / `src/race-flow.js` / `src/race-specials.js`, duplicated string tables or announcement copy that can share one helper, and code only used by non-race screens that rides these chunks. Prefer moving cold code (results-only, finish ceremony) into the existing lazy results/ceremony chunks over minifier tricks. Use `npx vite build` plus `gzip -9` on each chunk to measure before and after. Do NOT raise any budget in `tests/e2e/budget.spec.js`; lower the race-flow limit comment's stale "~7.1" figure to today's number.

## Acceptance criteria
- [ ] `race-step` ≤ 22.0 kB gz and `race-flow` ≤ 8.5 kB gz in the CI `[budget]` log lines (≥ 0.5 kB headroom each), main startup JS not larger than today.
- [ ] `npm run check` green; no unit/e2e test edited to pass, no behavior change (same tests, same screenshots).
- [ ] The budget spec's comments state the new "today" numbers.

## Test plan
Existing suites are the proof (behavior is unchanged): unit, e2e smoke/race/results specs and the budget spec. Paste before and after gz sizes in the PR body.

## Out of scope
New features; raising limits; touching `src/worker/`; changing the sim (live races and the server's score check depend on it).
