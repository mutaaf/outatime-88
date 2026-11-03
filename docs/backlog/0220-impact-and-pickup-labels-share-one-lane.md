---
id: 0220
title: An impact label and a pickup label never stack on the car (one hit-text lane)
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-28
pr: 184
---

## Why
Pillar 3 says never two texts on top of each other. 0114 queued the *pickup* plates, but
the shockwave labels (`spawnObstacleShatter`: "💥 SOLID TRAFFIC IMPACT!", takedown and
chain-hit text) are a separate list (`GameState.hitShockwaves`) with their own anchor. In a
scout play-through, a wrench pickup taken while crashing through traffic drew "+15 💚 HP
REPAIRED!" (390x844) and "💚 HP FULL!" (1280x720) directly over/under "💥 SOLID TRAFFIC
IMPACT!" at the car's rear: two plates fighting for the same pixels, in the busiest second
of the race. Racing HUD guidance favours short, peripheral-readable feedback rather than
competing text ([Bumper UI, car game interfaces](https://www.hudsandguis.com/2013/08/21/car-game-interfaces-bumper-ui/)).

## What
Give every floating hit/pickup label one shared slot manager: a new label that would land
within ~300 ms of a live one either stacks one plate-height above it (fixed offset, never
over the car's roofline) or, if three are live, replaces the oldest. Impact/takedown text
outranks a pickup plate (the pickup's icon and sound still fire). Touches `src/race-step.js`
(`spawnObstacleShatter`, `spawnAcquireAnimation`) and the plate draw in the renderer; keep
main-bundle growth under the headroom in docs/LESSONS.md (put the helper in an existing lazy
module if one is already loaded in a race).

## Acceptance criteria
- [x] A pure helper assigns each label a y-slot; two labels spawned within 300 ms get different slots (unit test)
- [x] Rects of simultaneously live labels never intersect, in a forced crash + wrench pickup at 390x844 and 1280x720
- [x] No label rect intersects the player car's box; all inside the canvas
- [x] Calm motion unchanged; no per-frame allocation added

## Test plan
Unit test for the slot helper. E2E via the `?debug` hook: spawn a shatter and an acquire
within 100 ms, read both label rects, assert no overlap at both viewports.

## Out of scope
Changing which events show text, point values, or the plate art.

## Shipped notes
Both kinds of label were already one list (`GameState.hitShockwaves`) laid out by `layoutLabels`, so
plates never shared pixels; what read as a fight was the lane reshuffling: every new label took the
slot nearest the car and shoved the live one up a plate, and the newest always won, so a wrench
could push an impact off. `layoutLabels` (src/popups.js) now gives each label a slot it keeps
(`e.slot`, 0 nearest the car); new labels fill free slots nearest the car (chain plate, then
impacts, then oldest). When the lane is full, `hit` labels (`spawnObstacleShatter`, the shield
save) outrank pickup plates, then the newest wins, and a label that loses its place is gone for
good (`e.gone`). The lane stays at LABEL.max = 2 (0205's chain plate + one) instead of the ticket's
three: three plates at once is the clutter pillar 3 forbids, and 0205's e2e holds it at two.
A pickup plate that loses its place stays hidden for the rest of its 0.65 s even if a hit ends just
after (its icon and sound still fire). A plate left alone in slot 1 stays there (no drop) unless
the car is so high that slot 1 is off the top, when it closes the gap instead of going to the side.
