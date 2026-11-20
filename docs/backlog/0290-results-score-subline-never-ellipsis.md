---
id: 0290
title: The results SCORE cell cuts its sub-line off with "…" on phones ("CLEAN RUN — NO PENALTIES…")
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-20
pr: 295
---

## Why
At 390x844 the results SCORE card's sub-line is `white-space: nowrap; text-overflow:
ellipsis` (`src/styles.css:1004`) and clips "CLEAN RUN — NO PENALTIES ✨" to
"CLEAN RUN — NO PENALTIES…". A run with several penalties, "65,027 − 24,360 (1 CRASH ·
2 WALLS …)" (`src/results-ui.js:47-57`), clips the explanation of *why* points were lost,
which is the whole point of the line (ticket 0073). WCAG 1.4.4/1.4.10 expect text to
reflow, not be cut, at narrow widths: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html

## What
Let the sub-line wrap to at most two lines (or shorten the clean-run copy to "CLEAN RUN ✨")
and make the card grow, keeping the 8-9 px floor from 0263. No other results layout change.

## Acceptance criteria
- [ ] At 390x844 and 320x568 no `#endPenaltyText` has `scrollWidth > clientWidth`, clean or with 3+ penalty reasons
- [ ] SCORE and PLACE cards stay equal height in their row; nothing overlaps
- [ ] 1280x720 layout unchanged

## Test plan
e2e (own spec file): finish a race clean and with forced penalties at 390 and 320 wide;
assert no horizontal overflow on `#endPenaltyText` and rect containment in the card.

## Out of scope
Changing penalty maths or labels.
