---
id: 0222
title: Settings → NOS can be a tap-to-toggle instead of a hold (keys, pad and touch)
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-29
pr:
---

## Why
Gas already holds itself (auto-gas, 0130), but NOS still needs Shift / N / LB / the touch NOS
button held down for as long as you want the burn. Holding a button or a stick-click is much
harder than a tap for players with limited hand strength or dexterity, and tiring over a long
race. The Game Accessibility Guidelines list "avoid, or provide alternatives to, requiring
buttons to be held down" and suggest toggles for long holds, while keeping the hold as a choice
because toggles are slightly slower
(https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/).
Xbox Accessibility Guideline 107 makes the same point with a racing example
(https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107).

## What
A Settings → Controls choice `NOS: HOLD | TOGGLE` (default HOLD, saved in `SaveStore.data.settings`
with a default so old saves load). In TOGGLE a press of Shift / N / pad LB / the touch NOS button
flips `InputState.nosHeld`; it also turns off by itself when the NOS heat runs out, on a crash
that already cuts NOS, at a warp, and when the race ends or pauses. A small "NOS ON" state shows on
the touch button and in the pause controls card so it is never a hidden mode. Touches
`src/settings.js` (default + normalise), the lazy settings panel, key/pad/touch handlers that set
`nosHeld` (`src/main.js`, `src/input.js`, `src/touch/`), `src/play-hints.js` wording. Main must not
grow beyond its budget (see 0223); put the toggle logic in a lazy chunk or an existing one.

## Acceptance criteria
- [ ] Default is HOLD and behaves exactly as today (existing nos tests unchanged)
- [ ] In TOGGLE one press turns NOS on and the next press turns it off, from keys, pad and touch
- [ ] Toggle clears on NOS empty, crash cut, warp, pause and race end (unit test per case)
- [ ] The touch NOS button and the pause controls card show the toggled-on state in text, not only colour
- [ ] Works at 390x844 touch and 1280x720 keyboard; old save without the field loads as HOLD
- [ ] No frame-time regression; main startup JS stays within budget

## Test plan
Unit: a pure `nosToggle(state, press, ctx)` reducer covering press, empty, crash, warp, pause.
Unit: settings normalise rejects bad values, old save keeps HOLD. E2E: set TOGGLE, tap Shift, assert
NOS burning across frames with the key up, tap again, assert it stops; phone tap of NOS likewise.

## Out of scope
Toggles for drift, jump or steering; remapping keys (0013); a hold-to-brake option.
