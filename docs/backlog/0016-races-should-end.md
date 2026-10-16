---
id: 0016
title: Make arcade races end — time extensions currently outpace the clock forever
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr:
---

## Why
Pillars 2 and 5. In Playwright runs on 2026-10-16 (after ticket 0014's pacing), *no* race on
levels 1–4 ended within 150 s — not even when only holding the gas — because warps (+12 s),
checkpoints and shortcuts keep refilling the 48 s arcade clock. A race with no end has no
tension, no finish line, and makes medal scores mostly a function of patience.

## What
Give arcade runs a shape: diminishing time bonuses per extension (e.g. each warp's +12 s
shrinks by 25%), a hard cap on total run length per level (~2–3 min), and a visible "final
lap" moment. Pure rules in `src/flux.js` or a new `src/race.js`; recalibrate
`LEVEL_MEDALS` in `src/progress.js` with the same Playwright method afterwards.

## Acceptance criteria
- [ ] Unit test: repeated time bonuses form a convergent series; total run time ≤ the level cap
- [ ] e2e: holding only the gas, the race ends (results modal visible) within the cap + 5 s
- [ ] Medal thresholds re-measured and updated with the measurement noted in progress.js
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/race.test.js`; e2e in `ladder.spec.js` with a time budget.

## Out of scope
Endless mode (level 5 may keep an endless variant explicitly labelled as such).
