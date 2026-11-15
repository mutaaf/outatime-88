---
id: 0274
title: Desktop title - the backdrop's "88 MPH" billboard and cinema sign are not cut by the RACE FRIENDS and VIEW pills
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-15
pr: 270
---

## Why
Scout run 2026-11-15, 1280x720 title screenshot: the scenic "88 MPH PER HOUR" neon billboard
sits directly behind the RACE FRIENDS pill and the left half of the cinema sign ("BIJOU
TONIGHT") is cut by the yellow arch struts and the pill, so the first screen shows
half-read signs next to the PLAY button. Readability pillar: a title with attitude should
let its one big sign read whole. Same family as 0208/0239 (title text clear of the hero car).

## What
Where the title camera frames the era-2026 scene, keep the 88 MPH billboard fully visible
between the PLAY row and the arches (shift the sign's lateral/forward offset in the title
scene, or fade backdrop signs that fall under the PLAY row's rectangle, as 0237 does for
screen edges). Touches the title scene setup in `src/` (the code that places backdrop signs
for the title camera); no new assets.

## Acceptance criteria
- [ ] At 1280x720 the title's "88 MPH" billboard has no overlap with the PLAY, RACE FRIENDS or VIEW controls (bounding boxes of the projected sign and the DOM controls are disjoint, or the sign is faded below 0.2 alpha while it is under one)
- [ ] Same check at 1920x1080 and 1024x768
- [ ] Phone title (390x844) unchanged
- [ ] No frame-time regression (e2e perf probe within budget); no new network requests

## Test plan
Add a title overlap assertion to the existing zero-overlap spec (`tests/e2e`, see 0021),
projecting the sign's screen rect and comparing it to the control rects; screenshots at the
three desktop sizes in the PR.

## Out of scope
Renaming or redesigning the signs (see 0189), the title logo, the hero car.
