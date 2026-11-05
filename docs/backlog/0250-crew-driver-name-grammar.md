---
id: 0250
title: A crew rival's nemesis line reads "ARE GUNNING FOR YOU", not "IS" ("VEX & ION ARDEN")
status: shipped
priority: P2
size: S
lens: content
created: 2026-11-05
pr: 234
---

## Why
The nemesis banner for the VEX crew reads "VEX & ION ARDEN IS GUNNING FOR YOU"
(`driver: 'Vex & Ion Arden'` in `src/data.js:299`, line built in `raceCalls`,
`src/rival-ai.js`). A two-person crew with a singular verb reads as a typo in the one
line that introduces your rival; pillar 1 asks for an identity that feels authored.

## What
Where a rival's `driver` contains " & " (or a new optional `plural: true` on the roster
entry), the sub line uses "ARE GUNNING FOR YOU"; other drivers are unchanged. Check the other
call sites that build "<driver> <verb>" strings (pass lines, results) for the same slip.
Touches `src/rival-ai.js`, possibly `src/data.js`.

## Acceptance criteria
- [ ] Nemesis line for a crew driver reads "... ARE GUNNING FOR YOU"; single drivers still "IS"
- [ ] Any other verb-agreement string built from `driver` is correct for crews
- [ ] Line still fits on one row at 390x844

## Test plan
Unit: `raceCalls` with a crew nemesis and a solo nemesis; assert the exact sub-line.

## Out of scope
Renaming or redesigning any driver or crew.
