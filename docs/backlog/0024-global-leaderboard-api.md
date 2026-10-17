---
id: 0024
title: Global leaderboard API on D1 — arcade initials, signed runs, plausibility checks
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 16
---

## Why
Operator: "a leaderboard". A global board turns a good run into something to show off and
a reason to replay; daily boards give everyone a fresh shot every day.

## What
- `src/worker/` (operator-owned): `/outatime/api/run` issues an HMAC-signed run token
  (key generated once and kept in D1); `/outatime/api/scores` accepts a score only with a
  valid, unused token, plausible score/distance for the server-measured run time, clean
  3-letter initials and under a per-address rate limit; boards are best-per-initials,
  all-time and per UTC day, per mode (ARCADE / INFINITE / DAILY).
- `wrangler.jsonc`: `main`, `run_worker_first: ["/outatime/api/*"]` (HTML keeps its
  no-transform `_headers`), and a D1 binding provisioned by name on deploy.
- `agents/control.json`: `src/worker/` frozen for agents.

## Acceptance criteria
- [x] Unit (real SQLite): accept/rank, reuse/forgery/impossible-run rejection, initials
      filter, best-per-initials boards, daily vs all-time, rate limit, offline binding
- [x] Local `wrangler dev` round-trip: token → submit → board
- [ ] Live: `/outatime/api/scores` answers 200 after deploy; HTML still has no beacon

## Test plan
`tests/unit/worker-leaderboard.test.js` with `tests/unit/fake-d1.js` (node:sqlite).

## Out of scope
The in-game UI (0025).
