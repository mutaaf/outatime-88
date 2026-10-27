---
id: 0214
title: Windows High Contrast (forced-colors) and "more contrast" keep every menu and button readable
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-10-27
pr:
---

## Why
`grep` finds no `forced-colors` or `prefers-contrast` rule anywhere in `src/` or `src/styles.css`.
Under Windows High Contrast the browser resets backgrounds, borders and shadows, so our
neon-gradient PLAY button, glow-only chips (RACE FRIENDS, VIEW 2D/3D, corner icons) and
pill toggles can lose their edges and their on/off state. Guidance: don't rely on background
colour for state, pair colour with a border or shape, use real text, and prefer system colour
keywords. Sources: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors ,
https://marcom.wwu.edu/accessibility/guide/support-forced-colors . Pairs with 0167/0198/0188.

## What
Add a `@media (forced-colors: active)` block (and a light `prefers-contrast: more` block that
thickens borders and drops text glow) to `src/styles.css`: every button, chip, toggle and tab
gets a `1px solid ButtonText` border, the selected state uses `Highlight`/`HighlightText`
plus a visible marker (outline or check glyph), focus rings use `Highlight`, and decorative
glows/gradients are dropped with `forced-color-adjust` left at its default. The canvas is
untouched. No JS, no new hosts.

## Acceptance criteria
- [x] With Playwright `forcedColors: 'active'`, the title, pause, settings and garage controls each have a non-zero computed border and text not equal to the background
- [x] A selected toggle (VIEW 2D/3D, a settings choice) is distinguishable from an unselected one with colours removed (marker or outline, not only fill)
- [x] The visible focus ring survives forced colours
- [x] Default rendering (no media feature) is pixel-identical at 390x844 and 1280x720
- [x] No main-bundle growth beyond the CSS bytes; gzip delta stated in the PR

## Test plan
New `tests/e2e/forced-colors.spec.js`: launch contexts with `forcedColors: 'active'` and
`contrast: 'more'`, walk the title, settings and pause menus, assert borders, selected-state
markers and focus outline; screenshot once for the PR body.

## Out of scope
Recolouring the 3D/2D canvas, a custom in-game high-contrast theme.
