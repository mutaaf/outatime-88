# Live races (ticket 0060)

Friends race each other in real time. Everything runs on the existing `outatime-88` Worker:
no new vendor, Workers Free plan.

## Flow

1. **RACE FRIENDS** (title) → **START A ROOM** (`POST /outatime/api/room` → 4-consonant code)
   or **QUICK RACE** (`POST /outatime/api/quick` → the fullest open public room, or a new one).
2. The lobby opens a WebSocket to `/outatime/api/room/<CODE>` (same origin only). The URL
   becomes `?room=CODE`, so a share link, a QR scan or a refresh lands straight in the lobby.
3. Guests get their racer's initials, or suggested ones (editable; saved to the racer), keep their car, and tap
   **READY**. The host can **START NOW** at any time (CPU cars fill the grid); when everyone
   (2+) is ready the room starts itself after 5 s. Quick races start 15 s after the first
   joiner, whoever is there.
4. The room picks a seed and a server start time. Every client estimates the server clock from
   ping/pong (lowest-RTT sample) and goes green at the same instant; the grid is called out
   during 3 · 2 · 1.
5. Each client simulates only its own car and sends `[progress, x, y, mph, flags]` at 10 Hz.
   Progress is the solo race's unit (`GameState.distance`, mph × s; `src/raceflow.js`), so live
   races reuse the solo race's laps, standings HUD (friends and CPUs are entries in
   `LiveTraffic.fieldEntries`) and finish detection. Friends are drawn ~110 ms in the past,
   interpolated between snapshots, extrapolated ≤350 ms on their own speed, at your Z plus
   their progress lead. There is no car-to-car contact (fair over any latency).
6. Crossing `LENGTHS[len].dist` sends `fin`; the server bounds the time (physics floor, server
   clock ±) and ranks everyone — CPUs from their deterministic profiles — when all connected
   racers finish, 30 s after the first finisher, or at the length's hard cap. The HUD clock
   counts down to that shared deadline.
7. Results show on every screen; **REMATCH** readies you up in the same room. Winners collect
   ★ stars for the session.

Live races force one shared pace (`LIVE.pace`), don't end on wrecks (you respawn), can't be
paused, and don't post to the global leaderboard.

## Server

| Piece | File |
|---|---|
| Routes, origin check, create throttle | `src/worker/live.js` |
| RaceRoom DO (Hibernation API, one per code) | `src/worker/room.js` |
| Pure room state machine (unit-tested) | `src/worker/room-core.js` |
| MatchIndex DO (quick races) | `src/worker/match.js` |
| Rules shared with the client | `src/worker/live-rules.js` |

Room state is one SQLite-backed key written on lobby changes only; race frames are relayed
from memory and never stored. Seats follow the racer (ticket 0090): the Worker verifies the
identity cookie on the WebSocket upgrade and hands the room only the public id, so a reload,
a second tab or a dropped connection reclaims the same seat; without a racer (cookies off)
a per-tab seat id + key does the same. The credential never enters a room message. After a
race, the humans you raced are added to your friends (public ids). Seats left empty
for 20 s between races are dropped; the host role migrates; late joiners spectate until the
next race. Rooms nobody is connected to are wiped after 10 minutes.

Abuse limits: 6 players per room, 512-byte messages, 20 msg/s per socket (burst 40, sustained
flooding closes the socket), frames clamped to what physics allows, finishes need ≥90% of
the distance actually reported, room creation throttled per IP per isolate, same-origin
WebSockets only. Nothing personal is stored: initials, car index, race times.

## Free-plan budget (checked 2026-10-17)

Workers Free, Durable Objects (SQLite backend only): 100,000 requests/day, 13,000 GB-s
duration/day, 5 M rows read/day, 100,000 rows written/day, 5 GB storage. Incoming WebSocket
messages bill at 20:1; outgoing messages are free; idle hibernating objects accrue no duration.

A 6-player, 60-second race ≈ 6 × 10 Hz × 60 s = 3,600 incoming messages ≈ 180 billable
requests, ≈ 128 MB × ~80 s ≈ 10 GB-s, and ~20 row writes. So the daily free allowance covers
roughly 500 six-player races (requests) or ~1,300 (duration) — far beyond family use.
Sources: developers.cloudflare.com/durable-objects/platform/pricing/ and /limits/.

## Tests

- `tests/unit/live-room.test.js` — room state machine, CPU grid, finish order, limits, match pick.
- `tests/unit/live-client.test.js` — interpolation, clock sync, standings, QR encoding.
- `tests/e2e/live.spec.js` — two browsers against `wrangler dev` (real Worker + DOs, started by
  Playwright with `LIVE_TEST=1`, which unlocks a few-seconds `TEST` race length that
  production rooms refuse): link → racing in ≤3 taps, synced start, identical results,
  rematch, reconnect, quick race, lobby layout on phones and tablets.
