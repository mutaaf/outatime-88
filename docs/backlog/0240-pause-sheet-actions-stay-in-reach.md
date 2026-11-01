---
id: 0240
title: The pause sheet keeps BACK TO THE TRACK, SETTINGS and QUIT in reach without scrolling
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-01
pr: 215
---

## Why
Pausing a race (Escape, or the pause button) opens the Garage sheet. A scout play-through at
390x844 measured its action row (CHANGE LEVEL, SETTINGS, QUIT TO HOME, BACK TO THE TRACK) at
y = 1459 to 1563 px, i.e. 1.7 screens down, below the car turntable, the car strip, paints and
the whole performance shop (the only thing on screen is the ✕ at the top). At 1280x720 the
same row is also below the fold. A player who paused for a second has to scroll past a shop to
resume or quit; the primary pause actions should never be the last thing on a long page. Games
that pause on touch keep Resume/Quit pinned, and WCAG 2.2 asks for targets that are reachable
without hunting ([WCAG 2.2 SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

## What
In `index.html` (the `#garageModal` action row) and its CSS: make that row `position: sticky;
bottom: 0` inside the sheet's scroll container with an opaque backdrop and safe-area bottom
padding, so it is always visible whether the Garage was opened from the title or from a pause.
No behaviour change to the buttons (ids `btnChangeEventFromGarage`, `btnSettingsFromGarage`,
`.quit-home`, `btnResumeFromGarage`). Keep the row to one line at 320 px (shorten spacing, not
labels) and keep the existing 44 px targets. Touches only `index.html` + CSS (no JS chunk).

## Acceptance criteria
- [ ] While paused at 390x844 (scrolled to the top), `#btnResumeFromGarage` is fully inside the viewport
- [ ] Same at 1280x720 and 844x390 (landscape phone: the row may take at most 25 % of the height)
- [ ] Scrolling the sheet to the bottom shows the whole shop; the sticky row never hides the last upgrade card (bottom padding on the list)
- [ ] The row is keyboard-reachable in the existing tab order and Escape still resumes
- [ ] No console errors; no new request to any host

## Test plan
New small spec `tests/e2e/pause-actions.spec.js` (own file: the flake guard repeats whole
changed specs): start a race, press Escape, assert the bounding box of the Resume button is
within the viewport at the three sizes above, click it, assert status returns to PLAYING.

## Out of scope
Reordering or hiding the Garage content while paused; redesigning the pause sheet.
