---
id: 0210
title: Every on-screen control meets minimum target size (24 px pointer, 44 px touch)
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-23
pr:
---

## Why
Invariant 5 promises touch targets of at least 44 px, but only the in-race pads are tested
(`touch-layouts.spec.js`). Small chips seen in the 2026-10-23 playthrough (the KEYS and
steering-mode chips beside the HUD, title toggles) are roughly 20-26 px tall. WCAG 2.2 SC
2.5.8 sets 24x24 CSS px as the pointer floor, with a spacing exception:
https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . Kids on phones miss
tiny chips, and a mid-race miss costs a run.

## What
Add an e2e audit that visits title, pause sheet, settings, garage, results and the race HUD,
lists every visible interactive element (button, a, [role=button], input), and checks its
hit box. Fix offenders with padding or `min-height`/`min-width` (CSS only, in `src/styles.css`
or the owning lazy chunk's CSS), without changing the visual design more than needed.

## Acceptance criteria
- [ ] At 1280x720 mouse: every visible control is at least 24x24 px, or has no other control's 24 px circle crossing it
- [ ] At 390x844 and 844x390 touch: every visible control is at least 44x44 px, or the documented exception list names it with a reason
- [ ] The audit fails if a new undersized control is added
- [ ] CSS budget (25 kB gz) holds; no layout shift on the title or HUD at the 7 sizes used by strip-marks

## Test plan
New `tests/e2e/target-size.spec.js` walking the screens above and asserting boxes via
`boundingBox()`; the exception list is a small constant in the spec.

## Out of scope
Redesigning menus; the in-race touch pads (already covered).
