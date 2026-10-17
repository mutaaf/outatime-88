---
id: 0060
title: Race friends live — share a link, join in one tap, synced start, results, rematch
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-17
pr: 30
---

## Why
Operator request: "friends should be able to start games and race each other live", and
"sharing the game and getting into a solid match should be so easy". Kids racing each other
across two tablets is the game's best moment; it has to work with zero setup.

## What
- RACE FRIENDS on the title → START A ROOM (4-letter code + share link + QR on tablets) or
  QUICK RACE (public matchmaking). `?room=CODE` opens straight into the lobby with suggested,
  editable initials. READY is the only required tap for a guest.
- One RaceRoom Durable Object per code (WebSocket Hibernation, SQLite-backed, Free plan) and
  one MatchIndex DO for quick races, on the existing Worker at /outatime/api/room/<CODE>.
- Host START (or everyone READY → 5 s auto start; quick races start by themselves) → shared
  seed + server start time → synced 3·2·1·GO with the grid called out → first to the flag.
- Each client drives its own car and sends 10 Hz state; friends are drawn ~110 ms behind,
  interpolated, with no car-to-car contact. Deterministic CPU cars fill the grid to six.
- Results (server-ranked, CPUs included), win stars, one-tap REMATCH that keeps the room.
- Limits: 6 players/room, 512-byte messages, per-socket token bucket, idle rooms wiped after
  10 min, finish times bounded by physics and the server clock, no PII.

## Acceptance criteria
- [x] e2e: share link → lobby → racing in ≤3 taps; both screens go green within 400 ms
- [x] e2e: both screens show identical results; rematch starts race 2 in the same room
- [x] e2e: reload slides back into the same seat; quick race auto-starts
- [x] e2e: lobby has no overlaps and ≥44 px targets on phones and tablets, both orientations
- [x] Unit: room state machine, CPU grid, finish order, limits, interpolation, clock sync
- [x] Verified on production with two real browsers (2026-10-17: synced green 12 ms apart, identical results, rematch)

## Test plan
Unit: `tests/unit/live-room.test.js`, `tests/unit/live-client.test.js`. e2e:
`tests/e2e/live.spec.js` drives two browsers against `wrangler dev` (real Worker + Durable
Objects). After merge: two real browsers on production create, join, race and finish.

## Out of scope
Car-to-car collisions over the network; live races posting to the global leaderboard.
