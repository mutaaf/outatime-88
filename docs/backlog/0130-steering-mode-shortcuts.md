---
id: 0130
title: Steering-mode shortcuts — switch keys/mouse/stick/D-pad/tilt and the co-pilot in one tap
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-10-18
pr: 77
---

## Why
The user asked for "shortcuts to switch steering modes". Steering sources were scattered:
tilt in settings, D-pad in the touch-controls panel, the co-pilot on a legacy hidden button,
and no mouse steering at all for laptops.

## What
- `src/steermode.js` (pure): the modes a device has (laptop: KEYS, MOUSE; phone/tablet:
  JOYSTICK, D-PAD, TILT; touch laptop: all), cycling, co-pilot levels OFF → SMART ASSIST →
  AUTOPILOT on `GameState.jarvisMode`, mouse steering (±30% of the width, dead zone, curve).
- `src/steermode-ui.js` (lazy chunk): **K** cycles steering (Shift+K back), **I** the co-pilot,
  gamepad **BACK** / **L3** the same; a pill under the HUD gear shows the mode (tap = next,
  hold or right-click = a compact picker with RECENTER TILT); a STEERING row in settings.
  A toast names the mode; the pill pulses at every race start.
- Saved per device in `settings.steer` / `settings.assist`; the touch kit's movement and its
  old steer-assist switch follow (and an old save's switch carries over once).
- Tilt is switched on inside the key press / tap (iOS needs the gesture); blocked tilt says so.
- Live races skip AUTOPILOT (smart assist stays allowed).

## Acceptance criteria
- [x] K / pill / picker / settings / gamepad all switch modes; the choice survives a reload
- [x] Mouse mode steers toward the pointer and does nothing in other modes
- [x] D-pad mode swaps the touch stick for the D-pad
- [x] Live races never run on autopilot
- [x] Main bundle stays under budget (the UI is a lazy chunk)

## Test plan
- Unit: tests/unit/steermode.test.js, tests/unit/input.test.js (BACK/L3)
- E2E: tests/e2e/steering.spec.js (desktop + touch)
