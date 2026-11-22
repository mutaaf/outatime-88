---
id: 0300
title: Settings → Controls: gamepad RUMBLE OFF / LOW / FULL
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-22
pr: 308
---

## Why
`src/forcefeel.js` drives the pad's dual-motor rumble (engine through the light motor, impacts
through the heavy one), and touch haptics already have on/off and strength in Controls
(Haptics entry in CHANGELOG, 2026-10-17). The pad has neither: a grep of `index.html` for
"rumble" finds nothing. Players who find vibration tiring, a wired pad that rattles a desk, or
a low-battery pad have no way to tone it down, and Xbox Accessibility Guideline 113 asks that
vibration can be adjusted or turned off:
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/113 .

## What
A Settings → Controls choice GAMEPAD RUMBLE: OFF | LOW (x0.5) | FULL (default), saved as
`settings.rumble` (unset = FULL, old saves unchanged, junk reads as FULL). `src/forcefeel.js`
scales (or zeroes, and does not call the actuator at all when OFF) the `weak` and `strong`
values `rumbleFor()` returns. A TEST button in the panel buzzes the pad for 300 ms at the chosen
level so the player can judge it without starting a race. Panel and normalise in the lazy
settings chunk; forcefeel.js already loads lazily.

## Acceptance criteria
- [x] Default FULL: `rumbleFor()` output and the existing force-feel tests are unchanged
- [x] LOW halves both motors; OFF sends zero and never calls `playEffect`/`pulse` on the actuator
- [x] TEST gives a 300 ms pulse at the chosen level; with no pad connected it says so in the panel (text, not only colour)
- [x] The setting persists; an old save and a junk value load as FULL
- [x] Touch haptics settings are untouched and still work on phones

## Test plan
Unit: the scaling helper at OFF, LOW, FULL and with out-of-range input. E2E (new
`tests/e2e/pad-rumble.spec.js`): mock a pad with a recording `vibrationActuator`, run a race
frame at FULL, LOW and OFF and compare the recorded magnitudes; click TEST and assert one pulse.

## Out of scope
Per-effect rumble toggles; trigger-motor rumble; rumble in menus.
