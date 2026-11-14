---
id: 0272
title: A gamepad that drops out mid-race pauses the game with a clear message
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-14
pr: 266
---

## Why
Pillar 6. `src/racestage.js` handles `gamepaddisconnected` only by switching the prompt wording
back (`padGone`, 0007). If a controller dies or its Bluetooth link drops at 100 mph, the car
simply stops steering and the player crashes into traffic before they understand why; an
auto-accelerating run keeps going. Console racers pause and show "controller disconnected"
for exactly this reason, and the Xbox Accessibility Guidelines recommend handling input device
changes gracefully (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101).
Note: browsers only reveal a pad after a button press, and the event fires reliably for
real disconnects, so this is cheap and safe.

## What
- On `gamepaddisconnected`, if the status is `PLAYING` and the last input was `'pad'` (not a TV
  `PhonePad`, which has its own link handling), pause the race through the existing pause path.
- The pause sheet shows one line in the existing announcement/pause copy style: "🎮 CONTROLLER
  DISCONNECTED. PRESS ANY BUTTON ON IT, OR USE KEYS / TAP TO CONTINUE". It clears as soon as a
  pad reconnects or the player resumes.
- A pad that disconnects on the title, grid countdown or results does nothing new.
- Keep it inside `src/racestage.js` / `src/race-flow.js`; no new module unless it exceeds ~40 lines.

## Acceptance criteria
- [ ] Dispatching `gamepaddisconnected` during PLAYING with `lastInput === 'pad'` leads to PAUSED
      and the message is visible and fits at 390x844 and 1280x720 (no clipping, 10 px type floor).
- [ ] The same event while the last input was keys or touch does not pause.
- [ ] Resuming works with keys, click or tap; the message is gone afterwards.
- [ ] The message text is in an `aria-live` / `role="status"` region.
- [ ] No console errors; no frame-time regression.

## Test plan
E2E `tests/e2e/pad-disconnect.spec.js`: start a debug race, set `lastInput` to pad via a stubbed
connect, dispatch `gamepaddisconnected`, assert PAUSED + the message, resume, assert PLAYING; and
a negative case with keyboard input. Unit test for the pure "should this pause" predicate if one
is extracted.

## Out of scope
Pausing for a TV phone-pad unlink (0175 covers its link UI); vibration or sound cues.
