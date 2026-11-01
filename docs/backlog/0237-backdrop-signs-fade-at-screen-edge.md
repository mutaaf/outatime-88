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
- `strip()` in `src/scenes/kit.js` paints through a tee (a Proxy) that sends every call and setting
  to the layer and to a sign-free twin; `sign()` draws on the layer only and records its box (text,
  backing plate, glow up to half the font size; layer px). After the paint, each box is cropped from
  the twin as the sign's clean patch (clipped to the canvas and the horizon, so the reflection
  painted later stays), and the twin is dropped. Anything painted after a sign (haze, a neighbour's
  emblem) is in its patch.
- Signs whose boxes overlap form a group (a marquee's lines, a sign and its subtitle) and show as
  much as their least-shown member, so a patch never slices a sign that shows whole.
- `fadeEdgeSigns()` runs in `stage.js` right after each layer's blit: a group within a band
  (max(8 px, 4% of the width)) of an edge gets its patches at 1 − `edgeAlpha`, fully once a member
  touches the edge. No allocation; a sign well inside is untouched. The two live-drawn signs (the
  1985 pylon's count word, the 2015 rain countdown) take `edgeAlpha` and follow their baked sign.
- `?debug` `__OT.backdrop().signs` lists the drawn layers' sign records (`sx`, `w` in layer px, `v`).
- Budget: ~750 B gz in the stage chunk. Two behaviour-neutral dedupes (roadside's own canvas helper
  → `layer()`, one `blit()` for props and hazards) won back ~70 B; the backdrop total budget goes
  29 → 30 kB (today ~29.6).
- First cut snapshotted the layer just before each sign; the self-review found the patch then erased
  whatever was painted after it inside the box (the ghost-jar emblem, haze, the next shop) and that
  a covered sign's patch could slice a neighbour showing whole. Hence the twin and the groups.
- Not covered: a hidden sign's glow beyond half a font size stays as a soft halo, and its mirror
  image in the wet-street reflections (2015, 2026, 2088; below the horizon at 0.3–0.45 alpha).
