---
id: 0025
title: Leaderboard in the game — 🏆 on the title, initials once, every run posts itself
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 19
---

## Why
Operator: "a leaderboard". The API (0024) is live; players need to see it and get on it with
zero friction.

## What
- Title 🏆 RANKS icon → board modal: ALL-TIME / TODAY / DAILY tabs, best per initials, your
  row highlighted, YOUR BEST, and the daily challenge card.
- Results: first run asks for 3-letter initials once (remembered in `save.initials`); every
  later run posts itself and shows "#7 ALL-TIME · #2 TODAY". Offline/rejected states are a
  calm line, never an error.
- `src/leaderboard.js`: fail-soft client (6 s timeout), own origin only. Each run gets a
  signed token at the green light.
- Results modal fits short screens (landscape phones, 360x640) with RACE AGAIN on screen.

## Acceptance criteria
- [x] e2e (mocked API): board renders and highlights you, tabs request the right board,
      offline board says so, initials asked once then auto-post, payload shape correct
- [x] e2e: results screen fully on screen at 844x390, 360x640, 1280x720
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/e2e/leaderboard.spec.js`, `tests/e2e/layout.spec.js`; e2e helpers stub the API by
default (vite preview has no Worker).

## Out of scope
Per-level boards; ghosts.
