---
id: 0229
title: Desktop first race: the coach card and the driver badge bar sit on the road and the arches
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-30
pr:
---

## Why
Scout play-through at 1280x720 (3 s after PLAY, fresh save): the TIP card (320x70) sits over
the left start-arch and the horizon billboards, a KEYS chip and "A / D TO STEER" pill are up
too, and the driver badge bar ("ROOK & THE PROFESSOR · '88 FLUX COUPE GULL-WING · NEXT CAR (N)")
stays across the bottom of the road for the whole race. At 120 mph the player must parse the
screen in a glance (pillar 3); the badge bar is title/garage information and does nothing
mid-race.

## What
During a race on the full (desktop) HUD, fade the driver badge bar out once the race is
stepping (it returns on pause, results, title), and dock the first-race coach card in the same
HUD row 0225 used for landscape phones instead of a floating card at the left. CSS/DOM only;
sim untouched.

## Acceptance criteria
- [ ] At 1280x720, from GO, `#driverBadgeBar` is not visible while racing and is back on pause/results/title.
- [ ] The coach card does not overlap the road area under `GameState.carBox`'s lane band or the start arch.
- [ ] Keyboard path unchanged: N still switches car where it did (title/garage); not while racing.
- [ ] No frame-time regression; main stays ≤ 58 kB gz.

## Test plan
e2e at 1280x720 after `racing(page)`: assert the badge bar's computed visibility/opacity is
hidden, re-appears after Escape; assert coach rect vs lane band. Fails on main.

## Out of scope
The 390x844 layout (0228) and landscape phones (shipped, 0225).
