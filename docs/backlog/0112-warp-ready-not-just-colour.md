---
id: 0112
title: WARP READY must not rely on colour or glow alone (shape + sound cue)
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-18
pr:
---

## Why
The WARP button signals "ready" with a yellow glow ring, and the speed/flux gauges are
colour-coded. WCAG 1.4.1 (Use of Color) says colour must not be the only visual means of
conveying information: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
Colour-blind and sound-off players currently get no second channel for the game's most
important cue.

## What
When flux is full: add a pulsing outline shape/label change ("WARP" → "WARP ▲ READY") on
the touch button and the keyboard hint, and a short rising audio tick through the SFX bus
(muted when SFX are off). Calm mode / reduced motion swaps the pulse for a static marker.
Touches `src/hud.js`, `src/touch/` button states, `src/audio.js`.

## Acceptance criteria
- [ ] Ready state is distinguishable in a greyscale screenshot (label/shape differs from not-ready)
- [ ] A one-shot audio cue plays once on becoming ready, never repeats while ready
- [ ] Reduced motion: no pulse animation, static marker remains
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Unit test for the ready-edge detector (fires once). e2e: set flux full via `__OT`, assert
the label text and `data-ready` attribute change; emulate reduced motion and assert no animation.

## Out of scope
A full colour-blind palette setting.
