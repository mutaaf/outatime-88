---
id: 0145
title: Mobile pass — crisp phones, controls off your car, installable, awake, straight to the race
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-18
pr: 84
---

## Why
The user: "game play on mobile needs to be soooo amazing". An audit on emulated phones and
tablets (iPhone 15/SE, Pixel 7, a throttled low-end Android, phone landscape, iPad both ways;
`scripts/mobile-audit.mjs`) found:
- The 2D road was drawn at 1 px per CSS px and stretched 2–3× on every phone: blurry.
- In portrait the NOS and DRIFT buttons sat on top of your own car.
- The first race opened behind a dimmed, paused thumb guide that needed reading and a tap.
- Every visit replayed the 9 s lineup before the lights.
- No web app manifest (no install / fullscreen), no screen wake lock (tilt racers' screens dim).

## What
- 2D renders at device pixels where the graphics tier allows (LOW 1×, MEDIUM 1.25×, HIGH 1.5×,
  ULTRA 2×, capped by the screen); the governor's ladder steps it down with resolution. Drawing
  code keeps working in CSS px (`viewW × viewH`), car sprites and the loop ride view are cached
  at the real pixel size.
- Touch layouts: a nearest-free-spot arc (most-used first) for tall phones, so no preset puts a
  button on the player's car; checked for every preset on every shipped viewport.
- First-race thumb guide plays over the start lights without pausing (0116).
- The lineup plays once per track per device (remembered), then it's lights-and-race (~3 s).
- `manifest.webmanifest` (fullscreen display, maskable icons), Apple home-screen icon and meta,
  `viewport-fit=cover` (the CSS already honours safe areas).
- Screen wake lock while racing; Android phones go fullscreen when a race starts (setting:
  Controls → Fullscreen races). Never under automation, never on tablets or installed apps.
- Compact one-line race tips on small screens.

## Acceptance criteria
- [x] On a 3× phone at HIGH the game canvas backing is 1.5× its CSS size; LOW stays 1×
- [x] No preset covers the car zone on any shipped viewport (unit + e2e)
- [x] First race on touch is never paused for the guide
- [x] Manifest + icons resolve; viewport-fit=cover
- [x] Wake lock held while racing, released otherwise, re-acquired on return
- [x] 4× CPU throttled phone keeps racing at a playable frame rate

## Test plan
Unit: layouts (car zone), device (fullscreen decision, wake keeper). E2E (mobile.spec,
touch.spec): crisp canvas, installable, controls off the car, guide doesn't pause, throttled perf.

## Out of scope
Real-device haptics tuning and iOS fullscreen (no API for it on iPhone).
