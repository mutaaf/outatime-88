---
id: 0007
title: Gamepad rumble on impacts and button prompts when a pad is connected
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-16
pr:
---

## Why
Gamepad input works (`pollGamepad`), but the game ignores the pad otherwise: the on-screen
hints say "SPACEBAR" / "KEY: H / E", and crashes/takedowns produce no haptics. The
`GamepadHapticActuator.playEffect('dual-rumble')` API is supported in Chromium and gives
Burnout-style impact feel almost for free.

## What
On `gamepadconnected`, swap control hint labels to pad glyphs (A/B/X/Y) and back on
disconnect. Fire short dual-rumble on crash, takedown, and time warp, scaled by impact; guard
all calls so unsupported browsers no-op.

## Acceptance criteria
- [ ] Unit test: a `rumble(strength)` helper in `src/input.js` calls `playEffect` with clamped magnitudes and never throws when the actuator is missing
- [ ] e2e: dispatching a synthetic `gamepadconnected` event swaps the hint text on `#btnFluxBoost`
- [ ] Keyboard/touch hints unchanged with no pad

## Test plan
Extend `tests/unit/input.test.js`; new e2e case using `page.evaluate` to dispatch the event
with a fake gamepad object.

## Out of scope
Remappable controls.
