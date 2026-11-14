---
id: 0271
title: Gamepad START pauses the race and resumes it (and A resumes from the pause sheet)
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-14
pr: 265
---

## Why
Pillar 6 (controls everywhere) and invariant 8 ("every control has a keyboard path", and a
pad is a first-class input). The Scout read the code on 2026-11-14: `src/controls-ref.js` says
"No pad button pauses", and `pollGamepad` in `src/input.js` reads A/B/X/Y/bumpers/triggers/BACK/L3
but never START (button 9). A player on a gamepad (or on a TV with a pad) who is interrupted
mid-race has to put the pad down and reach for the keyboard or mouse. Every console racer pauses
on START; the W3C standard mapping defines button 9 as START (https://w3c.github.io/gamepad/#remapping)
and the Xbox Accessibility Guidelines ask that a game can be paused and resumed from the input in
hand (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101).
The title/results already use A and START to play (`src/home.js` pollPad), so START is a
known "go" button here.

## What
- `src/input.js`: expose a fresh-press `start` edge on the pad poll (button 9), like `back`.
- In the race step / home glue, a fresh START press while `PLAYING` pauses (same path as the
  Escape/P key and the HUD gear); while `PAUSED` it resumes (same path as the key, including the
  3-2-1 beat of 0231). Only fresh presses count, so a held button never flickers pause.
- Pause sheet: with a pad in hand, A resumes (so the pause copy can say "A / START: resume"),
  B stays "no-op" (never quits by accident).
- `src/controls-ref.js`: add the pause line to the GAMEPAD card ("START · PAUSE") and fix the
  stale "No pad button pauses" comment.
- Touch/TV pad (`PhonePad`) is unchanged: its own PAUSE button already exists.
- Update `docs/ACCESSIBILITY.md` / the player guide (`guide/`) if they list pad controls.

## Acceptance criteria
- [ ] With a stubbed `navigator.getGamepads` reporting button 9 pressed, a race at status PLAYING
      goes to PAUSED; pressing it again resumes (with the resume beat).
- [ ] Holding START across frames toggles once, not every frame.
- [ ] START on the title still plays and on the results still plays again (no regression).
- [ ] The GAMEPAD controls card lists the pause button; keyboard Escape/P and the HUD gear
      behave exactly as before.
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse (pad stub only; no layout change).
- [ ] No frame-time regression (no per-frame allocation in the poll).

## Test plan
Unit: `tests/unit/input.test.js` asserts the `start` edge fires once per press and not while
held. E2E: a new `tests/e2e/pad-pause.spec.js` stubs `getGamepads` via `addInitScript`, starts a
debug race, presses START, expects the pause sheet, presses START again, expects the 3-2-1 and
then PLAYING.

## Out of scope
Navigating the pause or settings menus with the D-pad (0273). Remapping pad buttons.
