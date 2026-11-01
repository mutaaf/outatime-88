---
id: 0237
title: Backdrop signs fade out near the screen edge instead of being cut by it
status: shipped
priority: P1
size: M
lens: content
created: 2026-11-01
pr: 211
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
- [x] At 390x844, 1280x720 and 844x390, no era scene shows a sign cut by the screen edge in the first 10 s of a level (unit test over sign rects and the pan range, plus a screenshot check)
- [x] A sign fully inside the view is drawn unchanged
- [x] No per-frame allocation; e2e perf probe within budget

## Test plan
Extend `tests/unit/sign-fit.test.js` with the recorded rects at the extreme pan offsets for
each era; add an e2e screenshot assertion for the 2026 scene at 390x844.

## Out of scope
Rewriting sign copy (0189). Sponsor boards (0221 shipped).

## Notes (build)
- `strip()` in `src/scenes/kit.js` gives its canvas a `signs` list; while it paints, `sign()` records
  each sign's box (glow and backing plate included, layer px) and a patch: a snapshot of the layer
  under the box taken just before the sign is painted (clipped to the canvas and the horizon, so
  the reflection painted later stays).
- `fadeEdgeSigns()` runs in `stage.js` right after each layer's blit: a sign whose screen box is
  within a band (max(8 px, 4% of the width)) of an edge gets its patch laid back over it at
  1 − `edgeAlpha` (fully once it touches the edge). Newest first, so overlapping patches restore in
  order. No allocation; a sign well inside is untouched. The two signs drawn live (the 1985 pylon's
  count word, the 2015 rain countdown) take the same `edgeAlpha`.
- `?debug` `__OT.backdrop().signs` lists the drawn layers' sign records (`sx`, `w` in layer px, `v`).
- Budget: the feature is ~450 B gz in the stage chunk. Two behaviour-neutral dedupes (roadside's own
  canvas helper → `layer()`, one `blit()` for props and hazards) won back ~70 B; the backdrop total
  budget goes 29 → 29.5 kB (today ~29.35).
- Not covered: a sign's mirror image in the wet-street reflections (2015, 2026, 2088) is below the
  horizon at 0.3–0.45 alpha and is left as is.
