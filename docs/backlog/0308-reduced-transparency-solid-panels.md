---
id: 0308
title: prefers-reduced-transparency turns the translucent HUD and menu panels solid
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-27
pr: 324
---

## Why
HUD plates and menu cards sit on translucent dark fills over a busy, moving road. Players who
set "Reduce transparency" in their OS (low vision, migraine, dyslexia) get no response:
`grep prefers-reduced-transparency src` finds nothing, while `prefers-contrast` and
`forced-colors` are handled (src/styles.css ~1228). The media feature is supported in
current Chrome and Safari: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
and the WCAG 1.4.3 contrast floor is easier to hold on a solid fill.

## What
Add a `@media (prefers-reduced-transparency: reduce)` block in src/styles.css (and the
lazy CSS files that carry translucent panels, e.g. home.css, live.css) that sets the HUD
plates, announcer, coach tip, pause sheet and modal cards to an opaque version of their
current fill and removes `backdrop-filter`. CSS only; no JS, no gameplay change.

## Acceptance criteria
- [ ] With the media feature emulated to `reduce`, the computed background alpha of the HUD plates, coach tip, pause sheet and results card is 1 and `backdrop-filter` is none.
- [ ] Unchanged (still translucent) when not emulated.
- [ ] Text keeps ≥ 4.5:1 against the new fill.
- [ ] CSS gzip stays ≤ 25 kB.

## Test plan
E2E: `page.emulateMedia({ reducedTransparency: 'reduce' })` (if the Playwright version lacks
it, skip with a clear annotation, never weaken), read computed styles of the listed
elements at 1280x720 and 390x844; screenshot both.

## Out of scope
Canvas-drawn glass, 3D view effects, a manual in-game setting.
