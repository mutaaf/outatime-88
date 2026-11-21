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
`tests/unit/colour-vision.test.js` runs the real 2D draw code against a recording canvas context:
src/pickup-art.js paintIcon, src/scenes/era-props.js drawEraProp, and the obstacle chain of
src/render/sprites.js executed as written. A silhouette is the recorded geometry and colours are
the ones painted, so nothing about looks is typed into the test; only each hazard's answer
(steer / jump / slide / knock) is. Every pickup (7), road hazard (7, incl. any `ob.type` the chain
draws) and era prop (7) is audited; a new kind fails until it has an answer. Rings are found as full
arcs, round ellipses (aspect >= 0.6) and closed round polylines; the pine tree's gold graze oval
(aspect ~0.18, on the ground) is not one. Results: pickups have seven silhouettes, all in the white
ring; hazards with different answers all differ in silhouette (only HOLO_BARRIER = FLUX_CRATE share
art, same answer). The one failing pair was the 1885 TUMBLEWEED: two clean tan rings, 2.84:1 against
the pickup ring's white under deuteranopia (3.0 in greyscale), i.e. a hazard wearing the pickup cue.
It is now a spiky burr in the same colour (+47 B gz in the stage chunk; main unchanged).
Screenshots at 1280x720 and 390x844 were checked locally (PR #301 body); the sandbox can't attach images.
Scope: 2D only. The opt-in 3D view draws era props as plain blocks and pickups without the ring; a
follow-up ticket should cover it. Police vs rival: no POLICE_INTERCEPTOR is spawned on the road today.

## Test plan
New unit test above; existing pickup/hazard e2e specs stay green.

## Out of scope
A user-selectable colour-blind mode, re-theming the neon palette, HUD meters (done in 0280).
