---
id: 0208
title: Title tagline and offline badge stop sitting on the hero car at 1280x720
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-23
pr:
---

## Why
Scout screenshot of the 1280x720 title (pillar 1, a title screen with attitude): the
"RACE THROUGH TIME. DODGE · DRIFT · JUMP. LEVEL UP FOREVER." block and the READY FOR OFFLINE
pill are laid over the hero car's roof and tail, so the car, the title's star since 0192,
reads as a ghost under text. On 390x844 the car sits clear below. 0021 only checks
text-on-text overlap, so this layout passed.

## What
Re-flow the title stack at wide/short viewports (e.g. tagline beside or above the CTA group,
or lower the car anchor) so the car's roofline and tail rects stay free of title text.
CSS and title layout only; the scene and the car sprite are untouched.

## Acceptance criteria
- [x] At 1280x720, 1024x768 and 1920x1080 the title's text boxes do not intersect the hero car's on-screen rect (measured from the debug hook)
- [x] 390x844 and 844x390 unchanged or better, still zero overlaps (existing title specs pass)
- [x] PLAY stays the dominant target; no scroll

## Test plan
E2E on the title: read the hero car rect and each text rect, assert no intersection at the
three desktop sizes; screenshots attached to the PR.

## Out of scope
New title art, copy changes, the daily-challenge billboard.

## Shipped
At ≥ 900 px wide, ≥ 600 px tall and wider than 5:4 (desktops, tablets on their side): PLAY sits
right under the racer chip, RACE FRIENDS and VIEW share one row, the hook cards (or the pitch, as a
left-right zigzag) sit in two columns either side of a 40vw hole over the car, above the corner
icons, and the offline pill sits at the bottom edge between the icon groups. Phones are unchanged.
`title.spec.js` checks every title box against `GameState.carBox` at 1280x720, 1024x768 and
1920x1080, for a first visit and a returning player.
