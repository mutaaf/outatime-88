---
id: 0283
title: Prompts name the buttons of the pad in hand (PlayStation, Switch) not only Xbox letters
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-18
pr: 282
---

## Why
Pillar 6 (controls everywhere). Every pad prompt names Xbox buttons: `src/racecall.js`
"PRESS X OR RB RIGHT ON GREEN", `src/play-hints.js` "HOLD B / LT TO SLIDE UNDER", and the
controls card `PAD` array in `src/controls-ref.js` ("A · RT", "X · RB"). A DualSense or Switch
Pro pad reports the same standard mapping, but its face buttons read ✕ ○ □ △ (PlayStation) or
B A Y X (Switch, physical positions swapped letters), so "X" sends a PlayStation player to the
wrong button. Game Accessibility Guidelines: "Ensure that all key gameplay information is
conveyed by at least one form..." and the platform convention is to show the glyphs of the
device in hand (https://gameaccessibilityguidelines.com/). Ticket 0007 added hints for pads
but only one naming.

## What
Add a tiny pure `padFamily(id)` (reads `navigator.getGamepads()[i].id`: contains "054c" or
"DualSense"/"DualShock"/"Wireless Controller" -> `ps`; "057e" or "Pro Controller"/"Joy-Con" ->
`switch`; else `xbox`) and a `padLabels(family)` table mapping the four face buttons and
bumpers/triggers (xbox A B X Y LB RB LT RT; ps ✕ ○ □ △ L1 R1 L2 R2; switch B A Y X L R ZL ZR,
matching the physical position of the standard-mapping buttons). Route the pad strings in
`src/racecall.js`, `src/play-hints.js` and `src/controls-ref.js` through it. The table is
text only; put it in a lazy chunk (or `controls-ref.js`'s existing chunk) because the main
startup budget has ~0.01 kB left (lesson 2026-11-14). Default (no pad or unknown id) stays
Xbox, so nothing changes for current players.

## Acceptance criteria
- [x] With a stubbed pad whose id contains "054c", the grid hint reads "PRESS ✕ OR R1 RIGHT ON
      GREEN FOR A ROCKET START" and the controls card shows ✕ · R2 for gas.
- [x] With "057e" the hint uses the Switch labels; with an unknown id it is unchanged.
- [x] Switching pads mid-session updates the next prompt (family read when the prompt renders).
- [x] No prompt gets wider than its card at 320 px (existing layout tests pass).
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse (no pad = no change).

## Test plan
Unit: `padFamily` over real id strings for Xbox 360/One ("Xbox 360 Controller (XInput STANDARD
GAMEPAD)"), DualSense ("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"),
Switch Pro ("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)") and junk; `padLabels`
returns all eight keys per family. E2E: stub a pad with the DualSense id and assert the grid
hint text.

## Out of scope
Rumble changes, button rebinding, drawing glyph icons (text symbols only), the `?tv` pad page.

## Shipped note
The first criterion's "✕ OR R1" was a slip: the rocket start is standard button 2 or RB
(src/input.js), and button 2 is □ on a PlayStation pad, so the grid hint reads "PRESS □ OR R1".
Gas (button 0) is ✕ · R2 as written. START keeps its name on every pad (OPTIONS / + is a follow-up).
