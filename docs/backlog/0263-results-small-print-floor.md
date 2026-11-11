---
id: 0263
title: Results card stat captions never drop below 10px on phones
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-11
pr: 253
---

## Why
`.end-stats small` is 8px by default and 7px inside two phone media queries
(src/styles.css:886, 928, 982), in slate-400 on a dark card. The results card is the one
screen every run ends on, where a kid reads their score breakdown; 7px captions are below any
readable floor (Apple HIG minimum text is 11pt; WCAG 1.4.3 contrast needs 4.5:1:
https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Phones are first-class
(pillar 6).

## What
In src/styles.css set `.end-stats small` to >= 10px in every breakpoint and colour #cbd5e1 or
lighter. If the grid gets tight at 360px wide, let captions wrap or shorten caption copy in the
results markup (index.html / src/results-ui.js); never shrink the number. Card must not
scroll the page at 390x844 or 360x640 beyond what it does today.

## Acceptance criteria
- [x] Every `.end-stats small` computed font-size >= 10px at 360x640, 390x844, 844x390, 1280x720
- [x] Caption contrast >= 4.5:1 on the card background
- [x] No caption or number is clipped or overlaps another (rect check)
- [x] Results buttons (replay / title) stay >= 44px and on screen without page scroll at 390x844

Shipped notes: on main the card already scrolls past PLAY AGAIN at 390x844 (Endless goals, missions,
board row), so the last criterion is met as "no further scroll than before" (stats grid grows ≤ 8 px,
measured in-page) and "the button is reachable and ≥ 44 px". On short landscape phones (≤ 520 px tall)
the caption reads PEAK · TD, as its number does, so it stays one line (it wrapped at 640x360).

## Test plan
In the existing results e2e (grep tests/e2e for `end-stats` or results), finish a short race
(use the helper that reaches results), run the size, contrast and overlap checks above at the
four viewports.

## Out of scope
Results content, share card, ads slots.
