---
id: 0207
title: Menus keep keyboard focus inside and hand it back when they close
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-10-23
pr:
---

## Why
Settings, Garage, Ranks, the share sheet and the continue offer are full-screen overlays,
but none sets `aria-modal`/`inert` on the page behind it or returns focus to the control
that opened it (only the continue offer declares `aria-modal`). A keyboard or switch player
who presses Tab inside Settings walks off into hidden title buttons, and after closing, focus
lands on `<body>`. WCAG 2.4.3 (Focus Order) and 2.1.2 (No Keyboard Trap, "move away" works)
describe the expected pattern: focus enters the dialog, stays in it, and returns to the
trigger on close, with Escape as the exit
(https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html,
https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html). Invariant 8: every
control has a keyboard path.

## What
One small helper (`src/focus-scope.js`, lazy-loaded with the panels, not in main) that on
open records `document.activeElement`, focuses the first control, loops Tab/Shift+Tab inside
the overlay, and on close restores focus. Wire it to settings, garage, leaderboard and share
overlays. Do not change gamepad/touch behaviour or the in-race key map.

## Acceptance criteria
- [x] Opening Settings from the title moves focus into it; 20 Tab presses never reach an element outside it
- [x] Closing it (button or Escape) puts focus back on the control that opened it
- [x] Same for Garage and Ranks; during a race Escape/pause still works and focus is not stolen from the game
- [x] Main JS budget held (helper lives in a lazy chunk)
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Unit test for the Tab-wrap function (first/last element, hidden controls skipped). E2E
`focus-scope.spec.js`: open each overlay with the keyboard, Tab 20 times asserting
`document.activeElement` stays inside, close, assert the opener is focused.

## Out of scope
A screen-reader rewrite of the menus; the race HUD; the live-race lobby cards.
