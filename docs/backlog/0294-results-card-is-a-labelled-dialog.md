---
id: 0294
title: The results card is a labelled dialog that announces the finish and puts focus on PLAY AGAIN
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-21
pr:
---

## Why
Every other overlay in `index.html` (title, garage, leaderboard, settings, share) is a
`role="dialog"`, but `#gameOverModal` (the results card, `index.html` ~line 871) has no role,
no label and no `aria-modal`. A screen-reader or keyboard player who finishes a race hears
nothing, and focus stays on whatever was behind the card, so PLAY AGAIN is a tab hunt
away. The WAI-ARIA Authoring Practices dialog pattern asks for a label and for focus to move
into the dialog (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). 0207 made the
other menus keep and return focus; the results card was left out.

## What
Give `#gameOverModal` `role="dialog" aria-modal="true" aria-labelledby` its heading, move
focus to `#btnPlayAgain` when it opens (without scrolling the card), and return focus to
the title's PLAY when HOME closes it. Put one short summary in the existing `#endRankCard`
live region ("FINISHED 2ND OF 6 · TIME 1:42.3") using text already computed for the card.
Mostly static markup, so main bytes stay level; the focus glue goes in the already-lazy
`src/results-ui.js`. Respect the idle-home timer (0185): focus alone must not reset it.

## Acceptance criteria
- [ ] The card has a dialog role, a label and `aria-modal`; axe-style check finds a named dialog
- [ ] On open, `document.activeElement` is PLAY AGAIN; Escape / pad B still go home (0185)
- [ ] Tab and Shift+Tab stay inside the card while it is open; focus returns to the title control on HOME
- [ ] The live region speaks place and time once, not on every refresh of the rank card
- [ ] No visible layout change at 390x844, 320x568 and 1280x720

## Test plan
New `tests/e2e/results-dialog.spec.js`: finish a short race (pin finish as in LESSONS
2026-11-16), assert role, name, active element, focus trap cycle, and the live text.

## Out of scope
Restyling the card, the other modals, the leaderboard sheet.
