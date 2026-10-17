---
id: 0091
title: A leaderboard that makes you race again — rank movement, rivals, weekly seasons
status: in-progress
priority: P1
size: L
lens: content
created: 2026-10-17
pr:
---

## Why
Operator: "leaderboard should be super engaging and increase competition". A static top-10
of all-time scores is out of reach for most kids. A climbable weekly season, a named rival
and "exactly who to beat next" make every run count.

## What
- After every run: your weekly-season rank as a count-up with ▲/▼ movement, ★ NEW BEST,
  "🎯 12,400 BEHIND BIF FOR #2 THIS WEEK", chips for all-time / today / track and 🔥 streak.
- Boards: THIS WEEK (Monday reset, UTC), TODAY, ALL-TIME, TRACK (selected level, with medal
  badges), FRIENDS (you + racers met through links with `from=<public id>`), DAILY.
  Animated reveal, gold/silver/bronze podium, last week's champion 👑, your own row always
  shown (pinned below a gap when outside the top N) and scrolled into view.
- Title: one rival line, pulled at boot (no push): "🚨 ZED PASSED YOU — YOU'RE #4 NOW" since
  your last visit, else "⚔️ RIVAL DOC IS 800 AHEAD THIS WEEK". Daily streak on the daily card.
- Worker: /standing, /hall, /ghost; boards take level/cls/around; submit response carries
  rank movement and targets. Versioned payloads (v2 = car, class, breakdown that adds up)
  and per-class boards so a car feature can stay fair. Ghost traces stored (one per
  initials per track) and validated against the run. D1 kept small by pruning rows no
  board can show (and closing seasons into the hall of fame first).

## Acceptance criteria
- [x] Unit (real SQLite): rank movement/PB/target, weekly reset + hall of fame, track/class
      boards + own row, friends board from the profile, standing + who-passed-you, streaks,
      ghost validation/store/serve, pruning keeps every best, payload versions
- [x] Unit: rank/target/rival/season text helpers; ghost codec round trip
- [x] e2e (real handlers): two runs → #4 NEW → #3 ▲1 ★ with the right target; week board with
      your row and podium; title rival line, then "passed you" after a newcomer
- [x] e2e: own row pinned outside the top 10; track board; friends via a `from=` link
- [x] e2e: board has no overlaps / off-screen / sub-44px targets on phones and tablets

## Test plan
`tests/unit/worker-compete.test.js`, `tests/unit/compete-ui.test.js`,
`tests/unit/ghost-codec.test.js`, `tests/e2e/compete.spec.js`.

## Out of scope
Racing the ghost in-game (0092).
