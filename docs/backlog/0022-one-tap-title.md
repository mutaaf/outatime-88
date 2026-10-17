---
id: 0022
title: One-tap title — tap anywhere to race, the game teaches you while you play
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-17
pr: 15
---

## Why
Operator: "a more easy and simple initial start screen like Tag with Ryan". Casual mobile
runners (Tag with Ryan, Subway Surfers, Crossy Road) open on the hero with one obvious PLAY
and a couple of small icons; the first run starts in one tap with zero reading and teaches
in-context. Our title was a scrolling form: roster, five level cards, rulesets, tilt setup.

## What
- New `#titleScreen`: wordmark, best score, one pulsing PLAY ("tap anywhere" / "press
  Enter"), the current event as one line, and EVENTS / GARAGE / SOUND icons in the bottom
  corners so the car on the attract-mode road stays the hero. Race HUD hidden on the title.
- The old start modal becomes the EVENTS panel (driver, track, ruleset, how-to-play) with a
  BACK button; results "select level" and garage "change event" open it directly.
- `src/onboarding.js`: a first-run steer prompt above the steer pads until you steer (coach
  still teaches obstacles as they appear). `save.onboarded` (new default, old saves with a
  best score count as onboarded).

## Acceptance criteria
- [x] e2e: a tap in the middle of the title starts a race at 390x844, 844x390, 1280x720
- [x] e2e: ≤5 buttons on the title; Enter starts; icons open their panels instead
- [x] e2e: a new player sees the steer prompt until they steer; a returning player never does
- [x] Old-save unit test updated with the new default
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/onboarding.test.js`; `tests/e2e/title.spec.js`; smoke/ladder specs open EVENTS
before picking a level.

## Out of scope
Leaderboard icon (lands with the leaderboard, 0025).
