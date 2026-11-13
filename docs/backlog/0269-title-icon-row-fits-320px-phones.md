---
id: 0269
title: Title icon row fits a 320 px phone (SETTINGS no longer runs off the edge)
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-13
pr:
---

## Why
Pillar 6 (phone is first-class) and invariant 5 (touch controls work on every phone viewport).
Scout play-through at 320x568 (iPhone SE class, Playwright `iPhone SE`): the title's bottom
icon row (`.title-icons`, EVENTS / RANKS / GARAGE / SOUND / SETTINGS) is wider than the
screen. `#btnOpenSettings` measures x 276-342 on a 320 px page, so the gear is cut in half
and its caption is unreadable, RANKS and GARAGE touch each other, and the captions sit
below the fold. The only 320 px title check (title.spec.js, ticket 0230) measures just the
TILT and VIEW chips, so this slipped through. Xbox's guidance asks that text and controls
never be clipped at the player's size setting:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101

## What
Make the row fit at 320 px: the five icons share the width evenly (flex: 1 1 0, min-width 0,
a smaller gap) with the 44 px minimum target kept, and the captions allowed to wrap or
shrink no lower than 10 px. Check the row clears `#readyForOffline` pill and the safe-area
insets. CSS in src/styles.css (and home.css if the row is restyled there) only.

## Acceptance criteria
- [ ] At 320x568, 360x640, 390x844 portrait, every `.title-icons` button and caption lies fully inside 0..innerWidth and 0..innerHeight
- [ ] Each icon button stays >= 44x44 px; no two icon buttons overlap; captions >= 10 px
- [ ] No page scroll is added (documentElement.scrollWidth === innerWidth)
- [ ] 844x390 landscape and 1280x720 title look unchanged (screenshot compare)

## Test plan
Extend the "portrait title chips at 320x568" block in tests/e2e/title.spec.js: loop the five
icon ids, assert box inside viewport, >= 44 px, pairwise non-overlap, caption font-size.
Run it at 360x640 too. Break the CSS temporarily to prove the test bites.

## Out of scope
Redesigning the title; changing icons or copy.
