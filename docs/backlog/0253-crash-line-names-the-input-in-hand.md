---
id: 0253
title: The obstacle crash line names the control for the input in hand, not keyboard letters
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-09
pr:
---

## Why
Playing the phone build (390x844) on the first run, hitting a high gate printed
"BLOCKED! HOLD DRIFT (B) TO SLIDE UNDER!" and a low bar prints "JUMP (H/E) OR STEER AROUND!".
Those letters come from `src/race-step.js` (the `spawnObstacleShatter` label, ~line 1874): they are
hard-coded keyboard keys (`(S)`, `(H/E)`) shown to a thumb on a touchscreen or a pad player,
who have no such keys. Ticket 0007 already words the FLUX and ramp prompts per input
(`src/play-hints.js`); this line was missed. Xbox Accessibility Guideline 107 says on-screen
hints should reflect the player's actual input and bindings:
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107

## What
Add `slide` and `jump` lines to `PLAY_HINTS` (keys / pad / phone) in `src/play-hints.js` and
have the obstacle crash label read them through the same input-in-hand lookup the FLUX hint
uses. Keys keep today's words; pad names its buttons; phone says "HOLD DRIFT" / "HIT JUMP" (the
pad names on screen), without letters. Honour a rebound key where `playHint` already does.
Keep the label short enough to fit one line at 390 px.

## Acceptance criteria
- [ ] On touch input the high-gate crash line contains no parenthesised key letters; it names the DRIFT pad
- [ ] On touch input the low-bar crash line names the JUMP pad; on a gamepad it names its buttons
- [ ] Keyboard words are unchanged (existing tests stay green)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse
- [ ] No frame-time regression, no new per-frame allocation (strings built once)

## Test plan
Extend `tests/unit/play-hints.test.js` (or add it) asserting the three kinds return the right
words and that no `(`-letter key tokens appear for `phone`/`pad`. An e2e that crashes into a gate
with touch input is optional; the unit test is the gate.

## Out of scope
Changing the obstacle rules, damage, or the coach-dock tip wording (`src/coach-dock.js`; separate).
