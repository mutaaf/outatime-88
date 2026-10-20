---
id: 0111
title: Grid screen speaks keyboard — no "TAP ⚡" wording for keyboard players, and a slimmer line-up card
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-18
pr:
---

## Why
Playing level 1 at 1280x720 with a keyboard (2026-10-18 screenshot), the pre-race screen
showed "TAP ⚡ RIGHT ON GREEN FOR A ROCKET START" twice (under the level banner and inside
the lights card), wording written for touch. Meanwhile the six-row line-up and the lights
card cover most of the road for the whole countdown. Readability (pillar 3): one prompt,
worded for the device in hand, and the road still visible behind it.

## What
In `src/racestage.js`/`src/racecall.js` pick the hint by last-used input (keyboard: the
boost key name, gamepad: the boost button, touch: today's text) and show it once, in the
lights card only. Lay the line-up out as one compact row of six chips (initials + colour)
above the lights instead of a 2x3 block, so the car and road stay visible.

## Acceptance criteria
- [ ] Keyboard/mouse start shows no "TAP" text and names the real boost key, exactly once
- [ ] The line-up cards' "TAP TO SKIP ▶▶" pill reads "PRESS ENTER TO SKIP" (or the pad button) for keyboard/gamepad (seen again 2026-10-19 at 1280x720)
- [ ] Touch start keeps today's wording; gamepad shows the pad button
- [ ] Line-up block height ≤ 12% of the viewport at 1280x720 and 390x844; player car and road centre stay unobstructed
- [ ] Zero-overlap layout e2e still green at all viewports

## Test plan
Unit test for the hint chooser (input mode → string). Extend `tests/e2e/race-start.spec.js`
with a keyboard run asserting the hint text and a bounding-box check on the line-up.

## Out of scope
Changing the rocket-start timing window or the lights sequence.
