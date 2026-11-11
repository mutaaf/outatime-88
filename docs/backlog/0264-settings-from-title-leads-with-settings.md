---
id: 0264
title: Settings opened from the title leads with settings, not Endless goals and the power-up shop
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-11-11
pr:
---

## Why
Opening the gear on the title at 390x844 shows "ENDLESS LV 1 · DO ALL 3 TO LEVEL UP", three
mission rows and the 3-card POWER-UP UPGRADES shop above STEERING (screenshot from the
2026-11-11 play-through), about 40% of the first screen. `renderGoals` (src/runner-ui.js:97)
unhides `#pauseGoals`/`#pauseShop` whenever the mode is endless, whatever opened the panel. A
player who wanted steering or sound has to scroll past a shop; pillar 3 (clutter is a bug).
Goals and the shop make sense when paused mid-run, where the player is thinking about the run.

## What
Show `#pauseGoals`/`#pauseShop` only when the panel is opened from pause (a race is
PLAYING/PAUSED), and when opened from the title or garage hide them (the title already has its
goals line via `titleLine`, and the results card has the shop). Keep the pause view unchanged.
Touches src/runner-ui.js and the place settings-ui opens the panel (add a context flag; keep
settings-ui's lazy chunk budget).

## Acceptance criteria
- [ ] From the title gear, `#pauseGoals` and `#pauseShop` are hidden and STEERING is the first section
- [ ] From the pause gear in an Endless race they are visible exactly as today
- [ ] Reopening from title after a pause hides them again (no stale state)
- [ ] 390x844 and 1280x720; no console errors; main chunk <= its budget

## Test plan
e2e: open settings from title, assert both hidden and the first `.set-section` is in view
without scrolling; start an Endless race, pause, open settings, assert both visible.

## Out of scope
Redesigning the shop, goals copy, adding settings sections.
