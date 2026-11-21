---
id: 0297
title: Settings → HUD size: NORMAL or LARGE for the race readouts
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-11-21
pr:
---

## Why
0267 set a floor for in-race HUD text, but a phone is held at arm's length and low-vision players
cannot raise the floor. WCAG 1.4.4 (resize text) and the Game Accessibility Guidelines both list
adjustable text size as a basic feature: https://gameaccessibilityguidelines.com/ensure-that-all-text-is-adjustable-in-size/
and https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html .

## What
A Settings choice HUD SIZE: NORMAL | LARGE, saved as `settings.hudScale` (default NORMAL, old saves
unchanged). LARGE sets a CSS custom property that scales the position, timer, speed readout, meter
captions and coach-bubble text by about 1.25x, with panels reflowing rather than overlapping.
Touches `src/hud.js` styles, the settings panel and `src/save.js` defaults.

## Acceptance criteria
- [ ] LARGE grows the measured HUD font sizes by >= 20% and persists across reload
- [ ] Zero overlaps and no clipped text at 320x568, 390x844 and 667x375 in LARGE (reuse the zero-overlap harness from 0021)
- [ ] The speed readout, position and warp banner stay clear of touch controls
- [ ] No frame-time regression; main startup size does not grow beyond 0.1 kB gz

## Test plan
Unit: default and normalisation of `hudScale`. E2E `hud-size.spec.js`: toggle, measure fonts, run the overlap check at the three viewports.

## Out of scope
Scaling menus or the results card, a free slider, touch-control sizing.
