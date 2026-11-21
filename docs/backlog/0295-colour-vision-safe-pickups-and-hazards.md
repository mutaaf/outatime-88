---
id: 0295
title: Pickups, hazards and warp-ready stay distinguishable under colour-vision simulation
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-11-21
pr: 301
---

## Why
About 1 in 12 men has a colour-vision deficiency. Tickets 0112, 0167 and 0280 gave warp-ready,
the rival strip and the HUD meters a second cue, but nothing proves that the in-world marks that
decide a run (NOS vs FLUX pickups, hazards, police lights, rival colours) still differ once red/green
or blue/yellow collapse. WCAG 1.4.1 asks for information beyond colour:
https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html . Browsers ship Machado et al. (2009)
simulation matrices (https://firefox-source-docs.mozilla.org/devtools-user/accessibility_inspector/simulation/),
so a deterministic unit test can enforce it.

## What
Add `tests/unit/colour-vision.test.js` with the Machado severity-1.0 matrices for protanopia,
deuteranopia and tritanopia. For each pair of gameplay-critical palette entries that share a role
(pickup kinds, hazard vs pickup, police vs rival) require that the pair differs after simulation
in luminance by a minimum contrast OR carries a distinct shape/glyph in `src/data.js` / the pickup
renderer. Fix any failing pair by adding a glyph or shape, not by re-colouring the art direction.
Touches the palette constants, pickup and hazard draw code, and the new test.

## Acceptance criteria
- [x] Unit test lists every pickup and hazard kind and fails if a new kind has neither a shape/glyph cue nor simulated contrast >= 3:1 against its confusable partner
- [x] Every currently failing pair gains a distinct glyph or silhouette; screenshots at 1280x720 and 390x844 attached to the PR
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse
- [x] No frame-time regression (e2e perf probe within budget); main startup size does not grow (palette check lives in tests only)

## Outcome
`tests/unit/colour-vision.test.js` records the real 2D art through a fake canvas context
(src/pickup-art.js paintIcon, src/scenes/era-props.js drawEraProp) and checks the road hazards'
colours against src/render/sprites.js; every pickup kind (7), road hazard (7, FLUX_CRATE shares the
barricade) and era prop (7) must be listed with a cue. Pickups: seven distinct silhouettes, all in
the white ring. Road hazards with different answers (steer / jump / slide / knock) have distinct
silhouettes (the 0198 e2e measures them). The one failing pair was the 1885 TUMBLEWEED: two clean
tan rings, 2.84:1 against the pickup ring's white under deuteranopia, i.e. a hazard wearing the
pickup cue. It is now a spiky burr (same colour, +47 B gz in the stage chunk; main unchanged).
Police vs rival: no POLICE_INTERCEPTOR is spawned on the 2D road today, so there is no pair to test.

## Test plan
New unit test above; existing pickup/hazard e2e specs stay green.

## Out of scope
A user-selectable colour-blind mode, re-theming the neon palette, HUD meters (done in 0280).
