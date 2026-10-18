---
id: 0123
title: Loop and landing physics — carry speed over the top, land straight
status: in-progress
priority: P1
size: S
lens: player-feel
created: 2026-10-17
---

## Why
The user asked for "hot wheels like curves and loops … and better physics". The track lead
builds the loops (road contract `featureAt`); the car has to respect them.

## What
- **LOOP set pieces:** gravity slows the climb and gives the speed back on the way down (net zero). Under the loop's `minMph` (default 62) at the top, you fall off: speed drops to 40, with a callout and haptic. It costs speed, not points, so the server needs no new penalty kind.
- **Landings:** touching down sideways or with the wheel turned costs up to 25% of your speed. Landing straight keeps all of it.

## Acceptance criteria
- [x] Too slow at the top of a loop peels you off; fast enough carries through
- [x] Loop gravity nets to zero over a full loop
- [x] Landing straight keeps speed; sideways costs up to a quarter

## Test plan
- Unit: `tests/unit/handling.test.js` › set pieces
