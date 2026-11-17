---
id: 0278
title: A local career stats sheet (races, wins, warps, best chain, miles)
status: shipped
priority: P2
size: M
lens: content
created: 2026-11-16
pr: 276
---

## Why
Progression is local-only by design, but the player cannot see their own history: how many
races, wins, warps, the best chain, total miles. A small honest stats sheet gives long-term
goals without a server and without vanity badges or share cards.

## What
Counters live in the existing save (invariant 6: one key `outatime_cruisn_88_save_v2`, no new
key). `career` already has races, wins, takedowns, warps (`careerDefaults()` in src/cars.js,
`recordRace`); add only the missing fields (bestChain, distanceM) as defaults there, updated at race end, plus a read-only STATS sheet reachable from
the title or settings. Reuses existing sheet styling and gamepad menu navigation (0273).

## Acceptance criteria
- [x] Counters: races, wins, warps, best chain, total distance; survive reload
- [x] Corrupt or missing storage shows zeros, never throws
- [x] Sheet type never below the 10 px floor (0268) and fits 320 px wide
- [x] Reachable and closable by keyboard, touch and gamepad; focus returns to its opener (0207)
- [x] No network call, no new host

## Test plan
Unit tests for the counter reducer and storage parsing (an old save without the new fields gets zeros).
E2E in its own spec: finish a test race, open the sheet, assert the race count is 1.

## Out of scope
Server sync, achievements, sharing.

## Notes (Builder)
The groomed version (keep the counters in the one save key, invariant 6) is what shipped: races,
wins and warps were already in `career`; `bestChain` and `distance` are added by
`src/career-stats.js` (reads sanitise every field, so an old or corrupt save shows zeros), not
by `careerDefaults()`: that lives in main, which has ~0.02 kB of budget left. The
sheet is a read-only CAREER STATS section in Settings, below RACER, shown when Settings opens from
the title or garage (a paused race leads with its goals and shop, 0264). It is focusable, so Tab
and the D-pad land on it; DONE / Escape / B close Settings and focus returns to the gear (0207).
Distance is stored in `GameState.distance` units (speedometer MPH × seconds) and shown as
miles = distance / 3600, so it agrees with the speedometer (the Endless card's "m" label for the
same number predates this). Big counts shorten to K / M so a number never wraps in its cell.
