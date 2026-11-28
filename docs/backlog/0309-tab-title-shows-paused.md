---
id: 0309
title: The browser tab title says PAUSED when the game pauses itself, and restores on resume
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-11-27
pr:
---

## Why
A hidden tab (0032) and Alt-Tab (0304) pause a solo race, but the tab title stays
"OUTATIME 88: Neon Time-Warp Street Racer" (`document.title` is never written in src/). A
player scanning their tabs cannot tell a paused race from a running one, and a screen reader
user switching back hears no state. WCAG 2.4.2 expects titles that describe the page state:
https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html

## What
When the game enters PAUSED (any cause) set `document.title` to `⏸ PAUSED · OUTATIME 88`;
restore the original on resume and on returning to the title. Pure helper
`tabTitle(paused, base)`; the write is change-only. Put the glue in an existing lazy chunk
(pause code in the race step or pad-pause) rather than main (at its budget).

## Acceptance criteria
- [ ] Pausing by Escape, blur and hidden tab sets the paused title; resuming restores the original string exactly.
- [ ] Title is the original on the title screen and results.
- [ ] No per-frame writes (assert at most one write per transition).
- [ ] Main startup JS stays ≤ 57 kB gz.

## Test plan
Unit for `tabTitle`. E2E: start a race, press Escape, assert `document.title` contains
PAUSED, resume, assert it equals the original.

## Out of scope
Speed or position in the title; favicon changes; notifications.
