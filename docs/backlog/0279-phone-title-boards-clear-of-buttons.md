---
id: 0279
title: Phone title - backdrop signs fade where they pass behind RACE FRIENDS, TILT and VIEW
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-17
pr:
---

## Why
Scout run 2026-11-17, 390x844 title screenshot: the "DAILY CHALLENGE" board shows half its
text right of the RACE FRIENDS pill and under the VIEW pill, and a second sign ("...OOK OF")
sits behind the TILT row, so the phone's first screen has half-read text beside the PLAY
button. 0274 fixed this for desktop only (`src/title-row.js` gates on a desktop media query)
and left the phone "unchanged". Phones are first-class (pillar 6) and the title is the
first impression.

## What
Extend the 0274 fade in `src/title-row.js` to the phone title layout: a roadside board whose
projected rect falls under the PLAY row, RACE FRIENDS, TILT or VIEW pills eases to ~8% alpha.
Use the media query the phone title layout really uses in styles.css. Keep main's budget
(58 kB) and the 3D closure in mind: work stays in the lazy `title-row` chunk (lesson 2026-11-15).

## Acceptance criteria
- [ ] At 390x844 and 360x640 no title board with more than 0.2 alpha overlaps the PLAY, RACE FRIENDS, TILT or VIEW rects
- [ ] Desktop behaviour from 0274 unchanged (its spec still passes)
- [ ] Boards still show in the open gaps (not all hidden)
- [ ] No frame-time regression; budget.spec.js green

## Test plan
New spec `tests/e2e/title-phone-boards.spec.js` (own file, lesson 2026-11-15): wait for a real
overlap at 390x844 (as 0274's test does), then assert the overlapping board's alpha. Unit test
for any new pure rect rule.

## Out of scope
Renaming signs (0189), desktop sizes, the race view.
