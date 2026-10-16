---
id: 0002
title: Stop the coach card and warp announcer from overlapping at the top of the screen
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr:
---

## Why
At 1280x720, a few seconds into Level 1, the "88 MPH TIME WARP!" announcer
(`#announcerContainer`, top-20) renders on top of the tutorial `#coachCard`. Both become
unreadable at exactly the moment the player is being taught and rewarded. Readability at
speed is the north star.

## What
Give the HUD a single top-centre message lane: when an announcement fires while the coach
card is visible, either queue the coach hint or stack them (announcer below the coach card
with no overlap). Touch `index.html` layout classes and `triggerAnnouncement` /
`updateInteractiveCoach` in `src/main.js`.

## Acceptance criteria
- [ ] e2e test: trigger an announcement while the coach card is visible; the bounding boxes of `#coachCard` and `#announcerMain` do not intersect
- [ ] Holds at 1280x720 and 390x844
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
New case in `tests/e2e/smoke.spec.js` (or `hud.spec.js`) that starts a race, waits for the
first warp/coach overlap window, and compares `boundingBox()` rects.

## Out of scope
Redesigning the coach content or HUD art.
