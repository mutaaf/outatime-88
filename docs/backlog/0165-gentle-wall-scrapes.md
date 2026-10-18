---
id: 0165
title: Gentle wall scrapes — capped per contact, HP carries the cost
status: shipped
priority: P0
size: S
lens: player-feel
created: 2026-10-18
pr: TBD
---

## Why
Grinding a wall cost 4,000 points a second, so kids sank to −30,000 in the first lap and the
run felt ruined. The user: "decrease wall penalty". Since #77/#85 walls already scrub speed
and the Time Storm gains on scrapes, so points don't need to carry the whole consequence.

## What
- Rules v3 (`src/scoring.js`, shared with the Worker): each wall contact costs a 75-point tap,
  then 150 points a second after a 250 ms grace, capped at 300 per contact. Touches less than
  500 ms apart are the same contact. Crawling (under 30 mph) is still free.
- The run log adds two integers, `wallN` (contacts) and `wallBill` (Σ billable grind ms per
  contact), so the server recomputes the exact penalty. Payload version 3 (`src/worker/payload.js`);
  logs without `wallN` (older clients, offline-queued runs) keep the v2 rules and still validate.
- The server rejects forged contact totals: more billed than scraped, more than 1.5 s billed per
  contact, contacts closer together than the join window allows.
- Grinding wears HP (5/s, scaled by durability and difficulty), never below 1 HP.

## Done when
- A 3-second grind costs ≤ 300 points (was ~12,000) and drops HP; client charges equal the
  server recompute; v2 runs still validate.
