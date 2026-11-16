---
id: 0276
title: Close finishes show a photo-finish margin line on the results card
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-16
pr:
---

## Why
A race that ends by 0.3 s feels identical to one that ends by 12 s. Arcade racers sell the
last-second duel with a photo-finish line ("BY 0.21 s"). It turns a close loss into "one more
go" and a close win into a story, using numbers the sim already has. Reference: Game
Accessibility Guidelines and arcade-racer results screens both lean on a single clear
margin figure, not a table. https://gameaccessibilityguidelines.com/

## What
When the player finishes, compute the time gap to the nearest finisher ahead or behind
(from the existing finish timestamps) and show one line on the results card:
`PHOTO FINISH · WON BY 0.21s` / `LOST BY 0.21s`, only when the gap is under 1.0 s.
Pure helper `finishMargin(times, playerIndex)` in `src/racecall.js` (or a sibling module);
rendering in the existing results code. No new storage, no network.

## Acceptance criteria
- [ ] `finishMargin` returns null when the gap is >= 1.0 s or the player did not finish
- [ ] Gap < 1.0 s shows exactly one line, worded won/lost, 2 decimals, on the results card
- [ ] The line never overlaps other results text at 390x844 and 1280x720
- [ ] Reduced-motion: no animation required for the line to read

## Test plan
Unit tests for `finishMargin` (won, lost, tie, DNF, gap exactly 1.0). One e2e in its own
small spec file that forces a close finish via the test hook and asserts the line text.

## Out of scope
Replays, sharing, leaderboards, sound.
