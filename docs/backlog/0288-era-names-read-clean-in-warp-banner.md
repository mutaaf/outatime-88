---
id: 0288
title: The warp banner reads "ERA SHIFT: 1985 • CEDAR RIDGE 3D!" — drop the doubled year and the stray "3D" from era names
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-20
pr:
---

## Why
Playing a first race (1280x720 and 390x844), the 88 mph warp announcement showed the headline
"⚡ 88 MPH TIME WARP! ➔ 1985 ⚡" and, under it, "ERA SHIFT: 1985 • CEDAR RIDGE 3D! +9000 PTS".
The year appears twice, and "3D" is a leftover render-mode tag (it appears in the 2D view,
where it reads as a bug and is unexplained to a new player). The warp is the game's climax
(pillar 2), and its payoff line should be clean and one idea. The same strings are `era.name`
in `src/data.js` (lines ~84-201) and feed the era badge in `src/main.js` (~478).

## What
In `src/data.js` era `name` values, remove the "3D" suffix from 2026 / 1985 / 1885
("2026 • CLOCK HOLLOW", "1985 • CEDAR RIDGE", "1885 • CANYON RAVINE"). In the warp
announcement (`src/race-step.js` ~575) show the district without the year prefix
(e.g. "ERA SHIFT: CEDAR RIDGE! +9000 PTS"), e.g. by splitting on "• ". Keep the era badge
text readable. Do not touch level (`LVL n:`) names.

## Acceptance criteria
- [x] No era `name` in `src/data.js` ends in " 3D"
- [x] The warp sub-line contains the district name but not the era year or "•"
- [x] The era badge (main.js) still shows year and district
- [x] Sub-line fits one line at 390x844 and 1280x720 (no new wrap or overlap with the fork pills)
- [x] Main/race-step chunk budgets unchanged or smaller

## Test plan
Unit test over `ERAS`: no name matches /\b3D\b/. Extend the warp e2e (or add a small one) to
read the announcement text after a forced warp and assert the two lines share no year string.

## Out of scope
Renaming districts, changing the warp bonus, or the IP clean-up in 0189.
