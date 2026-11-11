---
id: 0266
title: The left-edge round touch button has a readable name for assistive tech and a visible glyph at rest
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-11
pr:
---

## Why
The 48 px round buttons stacked at the left edge on the phone race screen carry only an icon.
Check `aria-label`/`title` on every `.tc-*` button and `#tcPause`; any button missing a
specific accessible name (or named only by an emoji) fails WCAG 2.2 SC 4.1.2 / 2.5.8 spirit:
https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html . Found while playing 0265.

## What
Audit touch buttons in src/touch/*.js and index.html; give each a short, specific `aria-label`
("Pause", "Replay", "Camera"...) matching what it does. No visual change.

## Acceptance criteria
- [ ] Every visible touch-controls button has a non-empty `aria-label` that is not an emoji
- [ ] No visual diff on 390x844 and 1280x720

## Test plan
e2e: on touch context mid-race, every `button` inside the touch layer has `aria-label` matching /^[A-Za-z]/.

## Out of scope
New controls, rebinding UI.
