---
id: 0234
title: Flash-rate audit — no full-screen flash fires more than 3 times in any second
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-10-31
pr:
---

## Why
A race chains warp flash, crash flash, NOS burst, lightning (1955 era) and sponsor-board
pulses. Nothing proves they can't stack past WCAG 2.3.1's "three flashes in any one
second" limit; the Xbox guideline flags flashes over ~20% of the screen as a seizure
risk. Sources: https://www.w3.org/WAI/WCAG21/Understanding/three-flashes.html ,
https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118

## What
One pure helper `src/flash-budget.js` (`allowFlash(now, areaFraction)`) that the existing
full-screen / large-area flash call sites ask before firing; a flash over ~20% of the
screen is skipped (or dimmed to its non-flash fallback) if 3 already fired in the last
1000 ms. Reduced-motion keeps its stricter behaviour.

## Acceptance criteria
- [x] Unit test: 4th large-area flash within 1000 ms is refused, allowed again after 1000 ms
- [x] Small-area flashes (<20% of screen) are never refused
- [x] e2e: forcing warp + crash + lightning in one second logs <=3 large flashes
- [x] No visible change in a normal race; no per-frame allocation

## Test plan
tests/unit/flash-budget.test.js; one e2e in an existing small spec (not title.spec.js, see LESSONS on the flake guard).

## Out of scope
A photosensitivity warning screen; tuning flash colours.
