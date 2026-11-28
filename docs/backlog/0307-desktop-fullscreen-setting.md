---
id: 0307
title: Settings → Screen: FULLSCREEN button for desktop and tablets (a race without browser chrome)
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-27
pr:
---

## Why
A neon racer at 120 mph is best with nothing but road around it. Fullscreen exists only for
Android phones (`maybeFullscreen`, src/touch/device.js, called from the touch bridge), so a
desktop or iPad player has no in-game way to drop the tab strip and address bar, and F11
does not reach every browser or kiosk. The Fullscreen API is well supported:
https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API

## What
A FULLSCREEN toggle button (ENTER / EXIT) in the settings panel's display section, working
from the click gesture that presses it. Hidden when `document.fullscreenEnabled` (or the
webkit prefix) is false (iPhone). The label follows `fullscreenchange`. Do not change what
Android phones do on race start. Lives in the lazy settings-panel chunk, not main (main is
at its 57 kB budget: AGENTS.md § Budgets).

## Acceptance criteria
- [ ] Button shows ENTER FULLSCREEN, requests fullscreen on press, then shows EXIT FULLSCREEN; Esc or the button leaves it and the label follows.
- [ ] Hidden when the browser has no Fullscreen API.
- [ ] Keyboard path: reachable by Tab and Enter/Space; pad-navigable like other settings.
- [ ] Layout does not break at 1280x720 and 390x844 (canvas resizes on `fullscreenchange`).
- [ ] Main startup JS stays ≤ 57 kB gz; no new hosts.

## Test plan
Unit: a pure `fullscreenLabel(state)` helper. E2E (Chromium): open settings, stub
`documentElement.requestFullscreen` to set a flag and fire `fullscreenchange`, assert label
flips both ways; assert the button is absent when the API is stubbed away.

## Out of scope
Auto-fullscreen on race start for desktop; orientation lock; changing Android behaviour.
