---
id: 0289
title: Results card says "1 WARPS" and "0 TD" — pluralise the count and spell out TAKEDOWNS
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-20
pr:
---

## Why
Playing a race to the end (1280x720 and 390x844), the results card showed "6TH • 1 WARPS"
in the PLACE · WARPS cell, and the PEAK cell read "112 MPH • 0 TD". A single warp is the
game's climax; "1 WARPS" reads as a typo on the very card the player screenshots, and "TD"
is jargon outside the short-landscape caption. The strings are built in
`src/results-ui.js:136-137`; the HUD era badge area also has a `warpsCountText` ("0 JUMPS",
`index.html:122`, written near `src/main.js:475`) that may share the problem.

## What
Add a tiny pure helper (e.g. `plural(n, 'WARP')` returning "1 WARP" / "2 WARPS") and use it
for the warps cell and for takedowns ("1 TAKEDOWN" / "0 TAKEDOWNS") when the cell has
room; keep "TD" only where the `.cap-short` short-landscape rule already forces it. Check
`warpsCountText`/"JUMPS" for the same bug and fix it with the same helper.

## Acceptance criteria
- [ ] 1 warp reads "1 WARP", 0 or 2+ read "WARPS"; same for takedowns/jumps
- [ ] Results card cells stay on one line at 390x844, 320x568 and 1280x720 (no new wrap/clip)
- [ ] Main chunk stays within budget (put the helper in a lazy chunk or an existing module that already ships)

## Test plan
Unit test for the helper (0, 1, 2). Extend or add a small e2e spec (own file) that sets
`GameState.timeWarps = 1`, finishes a race, and asserts the cell text has no "1 WARPS".

## Out of scope
Rewording other results labels or changing scoring.
