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
- [ ] Main startup gz (entry + static imports, as `budget.spec.js` measures) drops by ≥ 1,500 B vs main
- [ ] Settings, tilt permission, rebinding, gears and the HUD size setting behave as before (existing e2e unchanged and green)
- [ ] Boot is still zero-console-error and the title draws without waiting on a new chunk (smoke spec)
- [ ] AGENTS.md budget line and LESSONS row updated with the new headroom

## Test plan
Existing `budget.spec.js`, `settings.spec.js`, smoke and phone specs must stay green unmodified except
the lowered budget constant. Add a unit/e2e check only if a moved module gains a new loader (e.g.
the panel opens after a cold tap and the saved settings are already applied on the first frame).

## Out of scope
New features, behaviour changes, raising any budget, the 3D or live chunks.
