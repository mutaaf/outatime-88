---
id: 0291
title: On phones the results card pushes PLAY AGAIN below the fold — pin the actions to the bottom edge
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-11-20
pr: 294
---

## Why
At 390x844 the results card stacks rivals, stats, bonus rows, three mission rows, the
initials box and the SHARE & CHALLENGE banner; PLAY AGAIN / HOME / RANKS are below the
visible area and need a scroll to find. Pillar 6 says phone is first-class, and "one more
run" is the retention loop of an arcade racer. A sticky action bar is the standard
pattern for long result sheets on mobile, and arcade-style retry should be one thumb tap:
https://www.nngroup.com/articles/sticky-headers/ (persistent controls reduce scrolling).
There is currently no `position: sticky` in `src/styles.css`.

## What
On narrow/portrait viewports only, make the results actions row (`PLAY AGAIN`, `HOME`,
`RANKS`) `position: sticky; bottom: 0` inside the scrolling results card with a backdrop
and safe-area padding (`env(safe-area-inset-bottom)`), so it is always visible. Desktop
and landscape stay as they are. Touch targets stay >= 44 px (0251).

## Acceptance criteria
- [ ] At 390x844 and 320x568, PLAY AGAIN's bounding box is inside the viewport with the card scrolled to top and to bottom
- [x] The bar never covers the initials input, POST button or share banner when scrolled to them
- [x] 1280x720 and landscape phone layouts unchanged
- [x] Keyboard/gamepad focus order unchanged (PLAY AGAIN still default focus)

Shipped notes: the sticky row is the PLAY AGAIN / HOME / RANKS (/ NEXT) row only; GARAGE / LEVELS stay in the
flow below it, so the bar covers ~70 px, not ~120. It applies to the one-column card (portrait, < 900 px wide).
`scroll-padding-bottom` on the modal keeps a Tab-focused or scrolled-to control clear of it. Default focus is
unchanged (the initials box when there are no initials yet). Pre-existing, not fixed here: when NEXT ▶ shows
(a level unlocked), the row needs ~366 px and runs past the card's right edge on phones (main too).

## Test plan
e2e (own spec file, small): finish a race at 390x844 and 320x568, assert the PLAY AGAIN
rect is within `innerHeight` at scrollTop 0; scroll to end and assert no overlap with
`#share` banner or initials rects.

## Out of scope
Reordering or removing results content; the mission rows' wording.
