---
id: 0301
title: Settings: GHOST ON / OFF (race without the ghost car)
status: proposed
priority: P1
size: S
lens: player-feel
created: 2026-11-23
pr:
---

## Why
Every race records a ghost and, when you have a best, races it (src/ghost.js, ticket 0092), with a
ghost car on the road and a marker on the strip. A grep of `index.html` and `src/settings.js` for
"ghost" finds no way to turn it off. Some players find a translucent second car on a busy road
noise (the readability pillar: clutter is a bug), and on a LOW-tier phone it is one more sprite per
frame. Most racers with ghosts (time-trial modes in the genre) let you hide it.

## What
Settings gets GHOST: ON | OFF, saved as `settings.ghost` (unset = ON, old saves unchanged, junk
reads as ON). When OFF, the ghost car and its strip marker are not drawn and the "vs ghost" gap is
not announced. Recording still runs and your best is still saved, so turning it back on later
works. Normalise in `src/settings.js`; the one draw gate sits in `src/ghost.js` (lazy), and the
panel row in `src/settings-panel.js`. Nothing is added to main: the setting reaches the ghost
chunk through `SaveStore.data.settings`.

## Acceptance criteria
- [ ] Default and every old save race with the ghost exactly as today
- [ ] OFF: no ghost car sprite and no ghost strip marker while a best exists; the sim, the
      finish time and the saved best are identical to ON
- [ ] A race run with OFF still records and saves a new best ghost
- [ ] The row is keyboard and pad reachable, labelled, and remembered across reload
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; main stays under its budget

## Test plan
Unit: normalise (unset/junk → ON). E2E: seed a save with a ghost best, race with ON (a ghost car
is drawn: read the ghost state `window.__OT` exposes) then OFF (none), reload and check the
choice persisted; finish an OFF race faster than the best and check the best was replaced.

## Out of scope
Choosing which ghost to race (friend/rival ghosts); recolouring the ghost.

## Builder note (2026-11-23): back to proposed, the premise does not match the code
The ghost is never raced automatically. `RS.pendingGhost` is armed only by the rank card's
"👻 RACE YOUR BEST" / "👻 RACE X'S GHOST" button (src/compete-ui.js renderRankCard → main.js
raceGhostOf), and that same tap starts the race. RESTART RACE re-arms it for that one race.
So OFF would hide a ghost the player asked for a second earlier. Also: `src/ghost.js` is in
main (main.js imports it statically), not lazy, and in 2D there is no ghost car, only the
👻 strip dot with its gap; the translucent car is 3D only (main.js collectCarsFor3D).
Before re-readying, the Scout should pick a real problem, for example: does the 3D ghost car
clutter the road, or should "race your best" be a mode the game remembers? Then this
setting may make sense.

