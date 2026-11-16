---
id: 0277
title: Rival crews trash-talk on a pass or takedown, one short line each
status: shipped
priority: P1
size: M
lens: content
created: 2026-11-16
pr: 274
---

## Why
The rivals have names and crews but never speak, so overtaking them feels mechanical.
One-line radio taunts ("Eat my exhaust, Kai!") give each crew a voice, support the
original-universe pillar and cost no assets. Arcade classics use this to make AI feel like
people. Lines must be our own invention (invariant 3.7): no film quotes.

## What
A small table of 3-4 original lines per crew in `src/data.js` (or a new `src/radio.js`),
chosen deterministically from the seeded run RNG. Fire through the existing announcer
channel (one channel only, pillar 3) on: player passes a named rival, a rival passes the
player, a takedown. Rate-limited to at most one line per 6 s and never during the start
sequence, a warp, or a crash banner.

## Acceptance criteria
- [x] Every crew has >= 3 lines; no line copies a film quote or trademark
- [x] At most one radio line per 6 s; none during start, warp or crash
- [x] Uses the single announcer channel, so nothing stacks on another banner
- [x] Works at 390x844 and 1280x720; a screen-reader live region announces it (0030)
- [x] Off when Coach tips are off (0201)

## Test plan
Unit test: table coverage per crew, deterministic pick for a seed, rate-limit and
suppression logic. E2E in its own spec: force a pass, assert the line text appears once.

## Notes (builder)
Lines live in `src/radio.js` (pure: table, seeded pick by a hash of the track seed so the race RNG is
untouched, pass/takedown edges, timing); `src/radio-run.js` is the glue, its own lazy chunk fetched by
race-late. The radio speaks at the lowest priority and only when the channel is free, so a pass's
position callout speaks first and the line follows; an event that waits more than 5 s is dropped.

## Out of scope
Voice audio, localisation, new crews.
