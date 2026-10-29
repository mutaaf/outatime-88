---
id: 0223
title: Free at least 1.5 kB gz of main startup JS so the next features are not blocked
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-10-29
pr:
---

## Why
`docs/LESSONS.md` records main at 58.99 / 59 kB gz after 0199, 0013, 0218 and 0219: each recent
ticket had to scrape bytes or reshape a feature to fit, and asset hashes alone move the number
by about ±12 B. Any ticket that needs a hook in main now risks failing `budget.spec.js`.
The lessons name the likely win: `src/settings-ui.js` (~11 kB raw) is statically imported by
`src/main.js` (line 54) although most of it (panel wiring, tilt permission flow, gears) is
only needed after a tap. Pillar 7: carve main into focused modules.

## What
Measure first (sourcemap build, per-module bytes in the entry chunk, record the top 10 in the PR).
Then move cohesive, non-first-frame code out of main into lazy chunks behind the existing
`loadPanel()`-style loaders (reuse existing lazy chunks; a new module imported by two lazy chunks
costs main ~30 B, see the LESSONS rows of 2026-10-21 and 2026-10-28). Keep what the title needs on
its first frame, including applying saved settings at boot. Do not change behaviour. Candidates:
the unused-at-boot parts of `settings-ui.js`, `ghost-codec.js`, other big modules the measurement
shows. Update the budget numbers in AGENTS.md § Commands and `tests/e2e/budget.spec.js`
only downward (a lower budget is the point; never raise one).

## Acceptance criteria
- [x] Main startup gz (entry + static imports, as `budget.spec.js` measures) drops by ≥ 1,500 B vs main
- [x] Settings, tilt permission, rebinding, gears and the HUD size setting behave as before (existing e2e unchanged and green)
- [x] Boot is still zero-console-error and the title draws without waiting on a new chunk (smoke spec)
- [x] AGENTS.md budget line and LESSONS row updated with the new headroom

## Test plan
Existing `budget.spec.js`, `settings.spec.js`, smoke and phone specs must stay green unmodified except
the lowered budget constant. Add a unit/e2e check only if a moved module gains a new loader (e.g.
the panel opens after a cold tap and the saved settings are already applied on the first frame).

## Out of scope
New features, behaviour changes, raising any budget, the 3D or live chunks.

## Notes (Builder, 2026-10-29)
Measured with a sourcemap build (raw minified bytes per module in the entry chunk; gz ≈ 0.38×):
main.js 39.1 kB, audio.js 10.0, data.js 9.4, render/sprites.js 7.5, track.js 6.6, settings-ui.js
5.1, identity.js 3.8, render/road.js 3.8, render/player.js 3.8, handling.js 3.8. Most of
settings-ui is boot wiring (initSettings, applying saved settings), so only its tilt sensor moved.
A scan for exports of startup modules that only lazy chunks reference found the rest:

| Moved | Where to | Main gz saved |
|---|---|---|
| `src/scoring.js`, `src/fork.js` (were in main only to ride `RACE_DEPS`) | imported by race-step / race-flow directly; both land in `race-step-*.js` (race-flow imports race-step) | 915 B |
| Tilt maths (`screenAngle`, `tiltAngle`, `tiltSteer`, `TILT`) + the orientation reader | new `src/tilt.js` (with the One Euro filter), the chunk tilt already fetched on enable | 403 B |
| Garage ratings, bars and buying (`STATS`, `STAT_LABELS`, `displayStats`, `buyCar`) | new `src/car-shop.js`, garage chunk only | 236 B |
| RACER panel save parking (`swapSave`, `dropSave`) | `src/racer-saves.js` is now panel-only; `mergeServerBests` moved to `src/progress.js` | 188 B |

Main startup 58.982 → 57.281 kB gz (−1,742 B); budget lowered 59 → 58. race-step 21.46 → 22.12 kB
(limit 23), race-flow 8.64 → 8.58 (limit 9). `src/hud.js` (~1.4 kB) is race-only too but fits in
neither race budget, so it stays in main for now. Tilt behaviour: a reading that arrives before
the chunk is kept and read once it lands, and the 1.5 s no-signal clock starts then.
