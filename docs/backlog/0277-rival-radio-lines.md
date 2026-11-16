---
id: 0277
title: Rival crews trash-talk on a pass or takedown, one short line each
status: ready
priority: P1
size: M
lens: content
created: 2026-11-16
pr:
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
- [ ] Every crew has >= 3 lines; no line copies a film quote or trademark
- [ ] At most one radio line per 6 s; none during start, warp or crash
- [ ] Uses the single announcer channel, so nothing stacks on another banner
- [ ] Works at 390x844 and 1280x720; a screen-reader live region announces it (0030)
- [ ] Off when Coach tips are off (0201)

## Test plan
Unit test: table coverage per crew, deterministic pick for a seed, rate-limit and
suppression logic. E2E in its own spec: force a pass, assert the line text appears once.

## Out of scope
Voice audio, localisation, new crews.
