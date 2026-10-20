---
id: 0190
title: Phone race HUD — the "ahead" gap pill and the timer are cut off at 390 px
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-20
pr:
---

## Why
Playing a first race at 390x844 (Playwright, headless Chromium), the top HUD row showed
the rival-ahead pill truncated to "▲ RI…" and the race timer cut to "0:06." between the
position card and the speed card. The gap to the car ahead is the number a racer reads
most; a truncated pill is the clutter-is-a-bug case from pillar 3 (Readability).

## What
Give the ahead/behind pills and the timer enough room at phone width: stack the gap pills
under the timer, or shorten to "▲ +1.2s" (initials only on wider screens). Touches
`src/hud.js` (text), `index.html` (`#hudGapAhead`), `src/styles.css` (`.gap`, `.gap-ahead`).

## Acceptance criteria
- [x] At 390x844 mid-race neither the timer nor `#hudGapAhead` has `scrollWidth > clientWidth` (no ellipsis)
- [x] The gap still reads as rival + seconds at 1280x720
- [x] No overlap with the position card, speed card or progress strip (zero-overlap spec still green)
- [x] No new per-frame DOM writes beyond the existing `text()` change guard

## Test plan
Extend the zero-overlaps / phone HUD e2e: start a race at 390x844, wait on `racing`, assert
no clipped text in the HUD row.

## Out of scope
Redesigning the HUD layout; the coach bubble (0166).
