---
id: 0239
title: Phone title PLAY button subtitle fits on one line
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-01
pr: 213
---

## Why
At 390x844 the PLAY pill's subtitle wraps to "ENDLESS HIGHWAY · TAP / ANYWHERE", leaving
a lone word on the second line and making the primary button taller and lopsided. It is the
first thing a phone player sees.

## What
Shorten the copy on narrow widths (e.g. "ENDLESS HIGHWAY · TAP TO GO") or reduce the
letter-spacing and font size with a clamp so it stays on one line from 320 px up, in the
title markup and CSS.

## Acceptance criteria
- [ ] At 320, 360, 390 and 430 px wide the subtitle is one line (e2e: element height under 1.6 x line-height)
- [ ] The PLAY pill stays at least 44 px tall and still starts a race on tap anywhere
- [ ] 1280x720 title unchanged

## Test plan
Add a case to a new small spec file (not title.spec.js, see LESSONS on flake-guard cost).

## Out of scope
Title layout and hero car (0230, 0226, 0208).
