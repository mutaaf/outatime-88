---
id: 0278
title: A local career stats sheet (races, wins, warps, best chain, miles)
status: ready
priority: P2
size: M
lens: content
created: 2026-11-16
pr:
---

## Why
Progression is local-only by design, but the player cannot see their own history: how many
races, wins, warps, the best chain, total miles. A small honest stats sheet gives long-term
goals without a server and without vanity badges or share cards.

## What
Counters saved in localStorage (versioned key, tolerant of missing or corrupt data, wrapped
in try/catch as elsewhere) updated at race end, plus a read-only STATS sheet reachable from
the title or settings. Reuses existing sheet styling and gamepad menu navigation (0273).

## Acceptance criteria
- [ ] Counters: races, wins, warps, best chain, total distance; survive reload
- [ ] Corrupt or missing storage shows zeros, never throws
- [ ] Sheet type never below the 10 px floor (0268) and fits 320 px wide
- [ ] Reachable and closable by keyboard, touch and gamepad; focus returns to its opener (0207)
- [ ] No network call, no new host

## Test plan
Unit tests for the counter reducer and storage parsing (corrupt JSON, old version).
E2E in its own spec: finish a test race, open the sheet, assert the race count is 1.

## Out of scope
Server sync, achievements, sharing.
