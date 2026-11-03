---
id: 0228
title: Portrait phone, first race: the tip card, DRAG TO STEER and WARP bubbles show at once; make them take turns
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-30
pr: 198
---

## Why
Scout play-through at 390x844 (headless Chromium, touch, 3 s after PLAY on a fresh save): a
full-width coach card ("Draft the green wake behind rivals for a slingshot" + GOT IT) sits
directly under the track strip, while the thumb guide's "DRAG TO STEER" and "WARP" bubbles
ride on the car and the HUD, the lineup is still on the strip, and the NOS/ROAR/JUMP/DRIFT
arc is up. That is five readable things in the first three seconds, and the pillar 3 rule is
one announcement channel. 0215 made the start grid take turns and 0225 did the same for
landscape phones; the portrait phone, the biggest audience, still stacks them once GO fires.
Reference: Xbox Accessibility Guideline 118/typical onboarding guidance is to teach one input
at a time (https://learn.microsoft.com/en-ie/gaming/accessibility/xbox-accessibility-guidelines/118
covers the sibling concern of too much happening on screen early).

## What
In the first race on a portrait phone (width ≤ 480, height > width), the first-race tip card
waits until the thumb guide's bubbles have been dismissed or timed out (the 14 s cap), then
shows once. Reuse the turn-taking the landscape fix added in `src/` (the 0225 coach docking
code and `src/touch/guide-tips.js`); no new module, and main's startup bundle must not grow
(budget 58 kB gz, see AGENTS.md § Commands).

## Acceptance criteria
- [ ] At 390x844 on a first race, from GO to the guide's dismissal at most one of {coach tip card, thumb-guide bubbles} is visible at any frame.
- [ ] The coach tip still shows once, after the guide, and GOT IT still dismisses it.
- [ ] Landscape phones and 1280x720 behave as on main.
- [ ] Main startup JS stays ≤ 58 kB gz; no new console errors.

## Test plan
Extend the phone first-race e2e (see tests/e2e/touch-layouts.spec.js / 0225's spec): sample
visibility of `.coach` and the guide bubbles via `hudRects()` every few frames from GO and
assert they never overlap in time. Fails on main. Keep it under the flake-guard budget
(LESSONS 2026-10-30): start from GO with `?debug`.

## Out of scope
Rewriting the tips' wording; the lineup/stat cards (0215).
