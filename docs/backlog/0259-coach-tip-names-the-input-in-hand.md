---
id: 0259
title: The LOW LASER and HIGH GATE coach tips name the input in hand, not all three at once
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-10
pr: 248
---

## Why
Playing the build at 1280x720 with a keyboard, the first coach card reads "Hop it (W / ▲ /
swipe up) — or go ◀ LEFT". A keyboard player is shown a swipe; a phone player is shown key
letters. 0007 and 0253 already made prompts follow the input in hand (`playHint`,
`InputState.lastInput`); the coach card in `src/coach-dock.js` `obstacleTip` still hard-codes
all three, and it is the very first thing a new player reads. Readability pillar: one clear
instruction, in the words of the device in their hands. Game Accessibility Guidelines, "provide
clear instructions / show the right control prompts for the device":
https://gameaccessibilityguidelines.com/basic/

## What
In `obstacleTip` (coach-dock.js, race-step chunk) build the LOW_LASER_BAR and HIGH_LIGHT_GATE
lines from the active input: keys → "W / ▲" and "S / ▼" (honour rebinds the way `playHint`
does); gamepad → its buttons; touch → "tap JUMP" / "hold DRIFT" (the on-screen pad names, see
`src/touch/icons.js` LABELS). Reuse `src/play-hints.js` words; add the two kinds there if
missing. Strings are built once per tip, no per-frame allocation. Keep each line one line at 390 px.

Shipped note (#248): W / ▲ is ACCELERATE; the jump keys are H / E (main.js, 0253's crash line), so the
keyboard tip names H / E. Jump is not rebindable (H/E are RESERVED); the duck line follows a rebound BRAKE key.

## Acceptance criteria
- [ ] With `lastInput` keys the low-bar tip has no "swipe"; the high-gate tip has no "swipe"
- [ ] With `lastInput` touch neither tip contains a key letter in parentheses or an arrow glyph
- [ ] With a gamepad the tips name its buttons
- [ ] A rebound jump/duck key shows the rebound key
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; the tip stays one line
- [ ] No frame-time regression

## Test plan
Unit: extend `tests/unit/play-hints.test.js` asserting the words per input for both kinds and
that keys/touch/pad lines never contain another device's vocabulary. Optional e2e screenshot.

## Out of scope
Crash lines (0253, shipped), tip timing, which tips teach what, the obstacle rules.
