---
id: 0273
title: Gamepad D-pad moves focus in the pause, settings and garage menus (A selects, B closes)
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-11-14
pr:
---

## Why
Pillar 6 and the Game Accessibility Guidelines item "Allow menus to be navigated with any
supported input" (https://gameaccessibilityguidelines.com/basic/). Today the pad drives the
race, and A/START plays on the title and results (`pollPad` in `src/home.js`), but every other
menu (pause sheet, settings, garage, events, leaderboard) needs a mouse, touch or keyboard.
Keyboard focus already works: 0207 (`src/focus-scope.js`) takes focus on open, loops Tab inside,
and returns it on close. A pad can ride on that: D-pad/left stick = Tab/Shift+Tab (and
arrow keys for sliders), A = click the focused control, B = the menu's own close.

## What
- In `src/home.js`'s pad poll (or a small `src/pad-menu.js` loaded lazily with the menus),
  while any `scopeFocus` menu is open: fresh D-pad up/left = previous tabbable, down/right = next
  (reusing `tabbables` and `nextTab` from `src/focus-scope.js`), A = `focused.click()`, B = the
  menu's close button (the same `onEscape` / close id each scope already knows).
- Stick input is edge-triggered with a repeat delay (~350 ms then ~120 ms) and a 0.6 dead zone.
- `setLastInput('pad')` so the prompts name pad buttons; in-race behaviour is untouched
  (the poll runs only when a menu is open or the status is not PLAYING).
- Visible focus ring already comes from 0207/0214: verify it shows on pad navigation.

## Acceptance criteria
- [ ] With a stubbed pad, opening Settings and pressing D-pad down moves focus to the next control
      in document order; A activates it; B closes the menu and focus returns to the opener.
- [ ] Held D-pad repeats at the stated rate and a held A fires once.
- [ ] Works in the pause sheet, settings, garage and leaderboard menus.
- [ ] While racing the poll does nothing and allocates nothing per frame.
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse (keyboard behaviour unchanged).

## Test plan
Unit: a pure `padMenuStep(prev, cur, dtMs, state)` returning `'next'|'prev'|'select'|'back'|null`
covers edges, repeat and dead zone. E2E `tests/e2e/pad-menus.spec.js` stubs `getGamepads`, opens
settings, walks focus, activates a toggle, and closes with B.

## Out of scope
Pad control of sliders by stick, on-screen keyboard for initials, remapping.
Depends on nothing, but best built after 0271 so START opens the pause sheet being navigated.
