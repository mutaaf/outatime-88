---
id: 0051
title: A real race — six named racers, three laps, a finish line, and a HUD you read at a glance
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-17
pr: 0
---

## Why
Kid playtest (2026-10-17, via the operator): "a good game, but we need an actual race".
Position was 1 + two rubber-banded rivals (a checkpoint even bumped it by one), races ended
on a countdown, not a line, and the HUD was a wall of tiny LED text, the desktop version of it
on iPads.

## What
- `src/raceflow.js` (pure): race length per level, three laps, rival paces + a soft rubber
  band, grid slots, standings (finishers by time, then by progress, in-place sort), ordinals,
  gaps, race-time format, line-crossing time, finish bonus.
- `src/main.js`: five rivals from the roster on a two-wide grid (you start at the back), each
  keeps its name all race (a wrecked rival rejoins behind you); live standings every frame;
  the line finishes the race with a placement bonus; the clock (now 60 s) is only a backstop.
- `src/hud.js` + `#raceHud`: big ordinal position (gold/silver/bronze), lap / FINAL LAP, race
  time + clock, gap to the car ahead and behind, a track strip with every racer's dot and
  lap ticks, speed with the 88 mark, flux, HP, score, the settings gear. Writes only on
  change, ~20 Hz. One grid whose areas move for phones (portrait: strip on its own row;
  landscape: one slim row) and scale with vmin up to a 13" iPad. `hudRects()` and
  `[data-hud-rect]` expose the blocks for other UI's no-overlap checks.

## Acceptance criteria
- [x] Field of six with names; position, lap and gaps on screen; FINAL LAP on the last third
- [x] Crossing the line ends the race with your place and a finish bonus
- [x] No overlaps at 390x844, 360x640, 430x932, 844x390, 768x1024, 1024x768, 820x1180, 1180x820, 1024x1366, 1366x1024, 800x1280, 1280x800, 1280x720
- [x] Rotating a tablet mid-race keeps the same race running and refits the canvas and HUD
- [x] HUD writes nothing when nothing changed

## Test plan
`tests/unit/raceflow.test.js`, `tests/unit/hud.test.js` (fake DOM counts writes);
`tests/e2e/race.spec.js` (HUD, final lap, finish line, tablet rotation); `layout.spec.js`
gains the tablet viewports and the new HUD blocks.

## Out of scope
Grid intro, countdown, callouts and the podium (ticket 0052); touch control placement.
