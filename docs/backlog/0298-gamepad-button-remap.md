---
id: 0298
title: Settings → Controls: remap the gamepad buttons (gas, brake, warp, jump, NOS)
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-11-22
pr: 305
---

## Why
Keyboard keys are rebindable (0013, `src/keybinds.js`) but the gamepad is hard-wired in
`src/input.js` `readPad()`: A = gas, B = brake, X/RB = warp, Y = jump, LB = NOS, buttons 8/10 =
steering mode and co-pilot. A player with one working hand, a stiff thumb or an adaptive
controller cannot move WARP off the face button they cannot reach. The Game Accessibility
Guidelines list "allow controls to be remapped / reconfigured" as a basic item:
https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured/ and Xbox
Accessibility Guideline 107 covers the same point for controllers:
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107 .

## What
In Settings → Controls add GAMEPAD BUTTONS, one row per action (GAS, BRAKE, WARP, JUMP, NOS)
with a "press a button" capture, RESET, and a refusal (plain words) when a button is already
taken. Saved as `settings.padMap` (`{ boost: 5, … }` of button indices, `null` = today's
defaults), normalised with a default so old saves load unchanged. `readPad()` keeps today's
indices when `padMap` is null. Triggers (RT gas, LT brake) and START/D-pad menu use (0271,
0273) stay fixed. The prompts that name the pad button (src/pad-glyphs.js, 0283) and the
pause controls card (`src/controls-ref.js`) must show the rebound button, not the default.
Main is near its gzip budget: put capture UI and normalise in a lazy chunk and keep the
`readPad()` change to a table lookup of a few bytes (measure with a build of the reverted tree,
see LESSONS 2026-11-21).

## Acceptance criteria
- [x] With no `padMap` every button works exactly as today (existing pad e2e and unit tests unchanged)
- [x] Rebinding WARP to another button makes that button warp and the old one do nothing in a race
- [x] A button already used by another action is refused with a spoken/visible reason; RESET restores defaults
- [x] Pad hint glyphs (PlayStation / Switch / Xbox families) and the pause controls card show the rebound button
- [x] The capture row is reachable and operable with the pad itself (0273 menu focus) and with keyboard
- [x] An old save and a corrupt `padMap` (wrong types, out-of-range index) load as defaults
- [x] Main startup JS stays within budget; `budget.spec.js` passes

## Test plan
Unit: pure `normalisePadMap` and `actionsFor(buttons, padMap)` (default, rebound, duplicate refused,
corrupt input). E2E (new `tests/e2e/pad-remap.spec.js`, mock `navigator.getGamepads` as pad-menus.spec
does): rebind WARP to button 1, press it in a race and assert the warp state; press the old
button and assert nothing; reload and assert it persists.

## Out of scope
Remapping triggers or the sticks; remapping menu navigation; per-controller profiles.
