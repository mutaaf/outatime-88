---
id: 0008
title: Add an original 1955 "Atomic Diner" era with its own palette, props and music motif
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-16
pr:
---

## Why
Warping is the core reward, and there are only five eras (2026, 1985, 1885, 2015, 2088). A
1950s era (chrome diners, atomic-age signage, pastel sky, drive-in screens) is the natural
missing stop for a time-travel racer and a strong visual contrast to the neon eras. Must be
original art direction, no film references (invariant 7).

## What
Add an `ERAS` entry in `src/data.js` with palette, sky/ground colours and decoration set; add
any new prop drawing in the renderer; add an era score in `ERA_SCORES` (`src/music.js`, ticket 0010 —
e.g. a swung doo-wop progression at ~100 bpm); make it reachable in the warp rotation. Do this *after* 0004 if it has shipped (use `src/track.js`).

## Acceptance criteria
- [ ] New era appears in the warp rotation; e2e test forces warps until the era badge shows the 1955 era name
- [ ] Screenshot at 1280x720 and 390x844 shows a visibly distinct palette and props
- [ ] Data integrity unit test still passes (levels reference valid eras)
- [ ] `tests/unit/music.test.js` passes with the new era's score (every era has a score; scores differ)
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Extend `tests/unit/data.test.js` for the new era's required fields; add an e2e case that
cycles warps and asserts `#eraBadge` text.

## Out of scope
New levels or bosses for this era.
