---
id: 0302
title: Settings: FRAME RATE 30 / AUTO cap for battery and heat
status: shipped
priority: P2
size: M
lens: performance
created: 2026-11-23
pr: 311
---

## Why
The render loop draws every `requestAnimationFrame` (60-120 Hz). On a phone that is the main
battery and heat cost, and a hot phone throttles into exactly the stutter the governor
(src/perf/governor.js) then fights by dropping resolution. Players on older phones or on battery
have no choice that trades frame rate for a cool, steady 30. A grep for "fps cap" / "frameCap" in
`src/` finds nothing. The sim runs on a fixed 120 Hz clock with blended frames (ticket 0070), so
a lower draw rate does not change the race. Reference for the loop: MDN requestAnimationFrame,
https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame .

## What
Settings → Graphics gets FRAME RATE: AUTO (default, today's behaviour) | 30. With 30, `mainLoop`
skips the render (not the sim steps) on every other display frame, using the timestamp it already
has rather than counting frames, so a 90/120 Hz screen also lands near 30. The governor's frame
interval sampling must treat the 33 ms cadence as expected (compare against the cap, not 16 ms)
so it does not step quality down for a deliberate cap. Saved as `settings.fps` (unset/junk =
AUTO). The check lives in the lazy `src/perf/gfx-boot.js` side; main only reads one number.

## Acceptance criteria
- [ ] AUTO is byte-for-byte today's behaviour (default, old saves)
- [ ] With 30, drawn frames per second are 28-32 on a 60 Hz run and the sim step count per
      wall-second is unchanged (120)
- [ ] The governor does not lower the tier because of the cap alone
- [ ] Race result for a seeded scripted run is identical on AUTO and 30
- [ ] Main JS stays ≤ 57 kB gz (say how if the hook costs bytes)

## Test plan
E2E (`@perf`, run alone): count `renderScene` calls over 3 s on AUTO vs 30 through the debug
counters; assert the ratio ≈ 2 and equal `GameState.distance` after a fixed number of sim steps.
Unit: the frame-skip predicate (timestamps in, draw/skip out) at 60, 90, 120 and 144 Hz.

## Out of scope
A 60/120 selector, per-tier defaults, anything that changes the sim step.
