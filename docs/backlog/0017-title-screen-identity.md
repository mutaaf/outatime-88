---
id: 0017
title: Title screen with attitude — a real wordmark and START above the fold
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr: 8
---

## Why
Pillar 1. The first thing a visitor from mutaafaziz.com sees is the title modal, and its
START button sat 869 px down on a 720 px desktop and 1,545 px down on a phone — below the
how-to-play wall, the roster and the level list. The name was plain text.

## What
A chrome-and-neon OUTATIME 88 wordmark with a one-line tagline; how-to-play collapsed into a
disclosure; a sticky START bar pinned to the bottom of the title screen.

## Acceptance criteria
- [x] e2e: `#btnStartRace` is fully inside the viewport on load at 1280x720, 390x844 and 360x640
- [x] How-to-play starts collapsed and opens on tap
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/e2e/title.spec.js`.

## Out of scope
Animated attract mode (candidate follow-up).
