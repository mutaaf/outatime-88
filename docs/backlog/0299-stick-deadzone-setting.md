---
id: 0299
title: Settings → Controls: stick DEADZONE (SMALL / NORMAL / LARGE) for worn or tremor-affected sticks
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-22
pr:
---

## Why
`PAD.dead` in `src/input.js` is a fixed 0.12 radial value. Worn sticks drift past it (the car
creeps left on a straight road) and players with a hand tremor or a very light touch want a
bigger one, while precise players on a new pad want a smaller one. The Game Accessibility
Guidelines ask for adjustable sensitivity on analog input:
https://gameaccessibilityguidelines.com/include-an-option-to-adjust-the-sensitivity-of-controls/ .
It is the cheapest control fix a pad racer can ship and today the player has no way to do it.

## What
A Settings → Controls choice STICK DEADZONE: SMALL (0.06) | NORMAL (0.12, default) | LARGE (0.22),
saved as `settings.padDead` (unset = NORMAL, old saves unchanged, bad values read as NORMAL).
`shapeAxis()` reads the chosen value instead of the constant `PAD.dead`; the response curve and
outer limit stay. Add a live preview in the panel: a small dot that follows the left stick and a
ring at the deadzone radius, so the player can see the drift. Settings panel code is lazy; keep
the main-bundle change to reading one module-level variable that the lazy panel sets (same shape
as `setPadDead(v)`), measured against the byte budget.

## Acceptance criteria
- [ ] Default behaviour is bit-for-bit today's (`PAD.dead` 0.12): existing steering-latency tests unchanged
- [ ] LARGE: an axis of 0.20 steers 0; SMALL: an axis of 0.08 steers a little; full lock is still reachable at the rim in all three
- [ ] The preview dot and ring move with a mocked pad and show the chosen radius
- [ ] The choice persists across reload; an old save and a junk value load as NORMAL
- [ ] No per-frame allocation added to `readPad()` (0005); main startup JS within budget

## Test plan
Unit: `shapeAxis` at the three radii (0, edge, rim) and monotonic past each radius. E2E (new
`tests/e2e/pad-deadzone.spec.js`): mock a pad with axis 0.2, assert steer 0 under LARGE and nonzero
under NORMAL; panel preview ring size changes with the choice.

## Out of scope
Per-axis or trigger deadzones; a calibration wizard; right-stick camera.
