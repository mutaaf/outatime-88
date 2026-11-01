---
id: 0237
title: Backdrop signs fade out near the screen edge instead of being cut by it
status: ready
priority: P1
size: M
lens: content
created: 2026-11-01
pr:
---

## Why
0236 made every era sign fit its own board, but backdrop layers pan with steering and
curves, so a sign can still be sliced by the screen edge. A play-through at 390x844 shows
the 2026 BIJOU marquee straddling the left edge, and "HOOK & LADD…" cut at the right edge
(see 0236 notes). On the phone's first hero shot it reads as a bug. The 0221 sponsor boards
already use a whole-or-faded rule; the baked backdrop signs do not.

## What
Record each baked sign's rect (layer-local) when `sign()` paints it in `src/scenes/kit.js`.
In the backdrop draw pass (`src/render/`), once per frame and with no allocation, fade each
sign's rect toward 0 as it nears or crosses the viewport edge, either by redrawing the
layer region with a clip or by moving signs inward on narrow aspect ratios at scene build.
Pick whichever stays within the frame budget.

## Acceptance criteria
- [ ] At 390x844, 1280x720 and 844x390, no era scene shows a sign cut by the screen edge in the first 10 s of a level (unit test over sign rects and the pan range, plus a screenshot check)
- [ ] A sign fully inside the view is drawn unchanged
- [ ] No per-frame allocation; e2e perf probe within budget

## Test plan
Extend `tests/unit/sign-fit.test.js` with the recorded rects at the extreme pan offsets for
each era; add an e2e screenshot assertion for the 2026 scene at 390x844.

## Out of scope
Rewriting sign copy (0189). Sponsor boards (0221 shipped).
