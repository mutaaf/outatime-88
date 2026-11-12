---
id: 0268
title: Title, garage and pill small print never drop below 10px
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-12
pr: 260
---

## Why
Scout measured the title screen at 390x844: the SETTINGS icon caption and the READY FOR OFFLINE
pill are 9px. A grep of src/*.css finds more 8-9px type: `.title-icon > small` (styles.css:247),
`.offline-pill` (:621), `.rank-chip` (:717), `.end-penalty` (:934), `.garage-chip` and
`.spec-label` (garage.css:16, 32), `.hook-text small` at 8.5px (home.css:57). It is the same
small-print problem 0262/0263 fixed on two other screens. Source:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101

## What
Set those selectors to >= 10px in every breakpoint (keep colours at #cbd5e1 or lighter on dark).
Let captions wrap or shorten copy if a row gets tight at 360px; never overlap or clip.
Touches src/styles.css, src/garage.css, src/home.css only.

## Acceptance criteria
- [ ] Every visible text node on the title and the garage has computed font-size >= 10px at 360x640, 390x844, 844x390, 1280x720
- [ ] No clipped or overlapping caption (rect check against parent content box, per docs/LESSONS.md 2026-11-11)
- [ ] Title buttons stay >= 44px and the title does not gain page scroll

## Test plan
Extend the title/garage e2e: open each screen, walk visible text nodes, assert size; run the
rect check at the four viewports.

## Out of scope
The in-race HUD (0267); changing any copy's meaning.
