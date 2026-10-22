---
id: 0201
title: A COACH TIPS setting turns the in-race tip card and thumb hints off
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-21
pr:
---

## Why
At 390x844 the coach tip ("Draft the green wake...") spans the full width under the track
strip, next to the steer hint and the pad cluster, on top of a screen already carrying HUD,
gap pill and clock. Xbox Accessibility Guidelines advise limiting simultaneous on-screen
text and letting players simplify (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103).
Players who already know the controls should be able to turn the coaching off for good.

## What
Add a Settings toggle `COACH TIPS: ON / OFF` (default ON) stored as a new defaulted field in
`SaveStore.data.settings` (invariant 6: add defaults only). When OFF the coach tips and
`THUMB HERE TO STEER` first-run bubbles are skipped; the announcement channel is untouched.
Touches `src/settings.js`, `src/settings-ui.js`, and the coach gate in the race-flow chunk.

## Acceptance criteria
- [x] Toggle in Settings, keyboard reachable, 44px target on touch, default ON
- [x] OFF: no tip card and no first-run bubbles appear in a race; ON behaves as today
- [x] Old saves load with the default (unit test with an old-shape save)
- [x] Main JS budget held (logic lives in the lazy chunk)

## Test plan
Unit test for settings normalisation; e2e toggles OFF, starts a race, asserts no `.coach-tip`.

## Out of scope
Rewriting the tips or the first-run steer prompt.
