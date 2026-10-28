---
id: 0028
title: A set piece at 88 — the first warp of a run lands somewhere memorable
status: dropped
priority: P2
size: L
lens: player-feel
created: 2026-10-17
pr:
---

> Dropped 2026-10-28: size L across track, music and every era. Split into 0217 (landing sting) and 0218 (first authored landing stretch); further eras follow as their own tickets.

## Why
The time warp is the game's signature moment. Today every warp is the same tunnel flash.
The first warp of a run could land in a short authored stretch (a clock-tower square, a
ramp over the canyon, a neon skyway) with its own music sting — a climax worth chasing.

## What
Authored 6–10 segment set pieces per era in `src/track.js`, inserted after the first warp;
a music sting in `src/music.js`. Split into per-era tickets before building (size L).

## Acceptance criteria
- [ ] Unit: set-piece segments are continuous with the road (track.test.js invariants)
- [ ] Screenshot at 1280x720 and 390x844 for each era's set piece
- [ ] Reduced motion keeps the moment without flashes
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/track.test.js` invariants; e2e warp via `__OT`.

## Out of scope
Cutscenes; anything that stops player control.
