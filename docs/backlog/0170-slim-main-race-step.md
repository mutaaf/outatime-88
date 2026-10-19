---
id: 0170
title: Slim main — the race step is a lazy chunk, budget back down to 58 kB
status: shipped
priority: P1
size: M
lens: performance
created: 2026-10-18
pr: 95
---

## Why
The main bundle crept from 60 to 72 kB gzipped in two days as every feature added code to
`src/main.js`. Every first visit downloads and parses all of it before the title can run, and
on a phone on a slow network that's time spent staring at a blank screen.

## What
- `src/race-step.js`, a lazy chunk, holds everything that only runs while a race is on:
  - the per-step simulation (`updateGame`) and the helpers only it calls;
  - traffic stepping (`LiveTraffic.update` and friends, assigned onto main's `LiveTraffic`);
  - race rules (damage, streaks, takedowns, specials, time warp);
  - race start (`startNewRace`, lineup and lights) and finish;
  - the race HUD.
- The chunk loads in parallel with the title. `startNewRace` in main runs straight away once it
  is in, or as soon as it lands, and taps made while it loads collapse into one start.
- The live controller comes up only once the race step is in, so a synced live start never
  waits on a chunk.
- Main only gets hooks:
  - race-time actions it still triggers (keys, touch, co-pilot, the debug hook) go through
    `raceCall` wrappers;
  - state both sides write lives on the shared `RS` object;
  - shared-module bindings reach the chunk as one `RACE_DEPS` object. If the chunk imported
    them itself, rolldown would split `data`, `state`, `save` and `progress` into extra startup
    chunks.
- Offline (`src/offline.js`) loads after the first paint, as its own lazy chunk.
- The budget test now measures what a first visit really downloads: the entry chunk plus every
  chunk it imports statically. Startup JS went from 73.2 to about 56.5 kB gzipped, and the budget
  is now 58 kB. The race step has its own 23 kB budget.
- `AGENTS.md` rule: new features ship as lazy chunks; main only gets the hooks that load them.

## Acceptance criteria
- [x] Startup JS (entry + static imports) ≤ 58 kB gzipped, enforced by `tests/e2e/budget.spec.js`
- [x] The race step is its own chunk (≤ 23 kB gzipped) and nothing at startup contains its code
- [x] No gameplay change: the full e2e suite passes (it is the regression net)
- [x] Time to the title and tap-to-driving are as fast or faster (4× CPU, ~1.6 Mbps, 150 ms RTT)
- [x] Live races still start in sync; the offline specs still pass

## Test plan
- `npm run check`: lint, unit tests and the full e2e suite.
- The budget spec checks the startup closure size, the race-step budget, and that the race
  step's code is not in the startup chunks.
- Startup timing (load → START visible, tap → PLAYING), median of 5 runs, with CPU and network
  throttled, before and after.
