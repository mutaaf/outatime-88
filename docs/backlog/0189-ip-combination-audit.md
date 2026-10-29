---
id: 0189
title: IP combination audit — the 2026 square and the 1955 clock-tower wire reference one film too closely
status: proposed
priority: P1
size: S
lens: authenticity
created: 2026-10-19
pr:
---

## Why
Invariant 7: no recognisable film references; a lesson from 2026-10-17 already says a
generic silhouette becomes a reference *by combination*. Playing level 1 showed, together:
a courthouse clock tower stopped at 10:04 and struck by lightning, a "SAVE OUR CLOCK
TOWER" flyer, a cable from the tower to a lamppost with sparks at 88 mph, a cinema showing
"ALIENS FROM PLUTO", a "HOOK & LADDER 8 / PARANORMAL DIV." firehouse with a ghost-in-a-jar
emblem, and a trick called "PROFESSOR BACKFLIP" with a crew called "ROOK & THE PROFESSOR".
Each is defensible alone (`docs/EASTER_EGGS.md` lists them as deliberate nods); together
they read as quotes of two specific films. This is the operator's call, so it is
`proposed`: do not start until the operator promotes it.

## What
Keep the structure (era set pieces, the 88 mph spark moment), change the identifying
details: a different landmark (e.g. a lighthouse or radio mast), a different time on the
face, new flyer/cinema/firehouse copy and emblem, rename the trick and crew's epithet.
Update `docs/EASTER_EGGS.md`, `src/scenes/s1955.js`, `s2026.js`, `kit.js`, `src/race-step.js`,
`src/data.js`.

## Acceptance criteria
- [ ] No clock-tower + lightning + 10:04 + flyer combination survives in any era or loop
- [ ] No "HOOK & LADDER", "PARANORMAL", "ALIENS FROM PLUTO" or "PROFESSOR" string in `src/`
- [ ] `tests/unit/ip-denylist.test.js` gains the removed strings; `docs/EASTER_EGGS.md` matches
- [ ] Era e2e (backdrops, setpieces) green; scene chunks stay within budget; screenshots at 1280x720 and 390x844

## Test plan
Denylist unit test extension, `backdrops.spec.js`, `setpieces.spec.js`.

## Out of scope
The OUTATIME 88 title and the 88 mph mechanic.
