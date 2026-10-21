---
id: 0007
title: Gamepad rumble on impacts and button prompts when a pad is connected
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-16
pr: 141
---

## Why
Gamepad input works (`pollGamepad`), but the game ignores the pad otherwise: the on-screen
hints say "SPACEBAR" / "KEY: H / E", and crashes/takedowns produce no haptics. The
`GamepadHapticActuator.playEffect('dual-rumble')` API is supported in Chromium and gives
Burnout-style impact feel almost for free.

## What
Rumble already shipped with 0183 (`src/forcefeel.js`) and the grid's rocket-start/skip prompts with
0111; `#btnFluxBoost` no longer exists. What remained (narrowed 2026-10-21 by the Builder): the
in-race prompts that still named keys — the first-run steer prompt, the coach's FLUX FULL line, the
HUD flux hint and the ramp call — name the pad's buttons once a pad connects (`gamepadconnected` or a
pad press), and go back to the keyboard/touch words on `gamepaddisconnected`.

## Acceptance criteria
- [x] e2e: dispatching a synthetic `gamepadconnected` event swaps the steer prompt and the flux hint
  to pad wording, and `gamepaddisconnected` restores them (`tests/e2e/pad-hints.spec.js`)
- [x] Keyboard/touch hints unchanged with no pad (the wording table keeps the original words for keys,
  touch and no input; the e2e checks keyboard; a pad on a touch screen still shows the pad wording)

## Test plan
`tests/unit/play-hints.test.js` (wording table), `tests/unit/input.test.js` (setLastInput / padGone),
`tests/e2e/pad-hints.spec.js` at 1280x720.

## Out of scope
Remappable controls.
