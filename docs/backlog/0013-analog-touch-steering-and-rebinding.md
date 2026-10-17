---
id: 0013
title: Rebindable keyboard controls (analog touch steering already shipped in 0061)
status: ready
priority: P2
# Groomed 2026-10-17: the touch half shipped with 0061 (thumbstick, dead zone, layouts); only keyboard rebinding remains. Gamepad rumble/glyphs live in 0007.
size: M
lens: player-feel
created: 2026-10-16
pr:
---

## Why
Pillar 6. On phones steering is two digital arrow buttons; analog drag-steering (thumb
position → steer amount) feels far better. Keyboard players need rebinding (AZERTY, left-handed).

## What
Drag-anywhere-on-lower-half steering with a dead zone and visible thumb indicator; keep the
buttons as a fallback toggle. A small controls panel to rebind keys, stored under new save
fields with defaults.

## Acceptance criteria
- [ ] Unit test: a binding table maps key codes to actions; defaults match today (A/D/arrows, Space, etc.); conflicts are rejected
- [ ] Rebound key persists across reload and drives the action
- [ ] Touch targets ≥ 44px

## Test plan
`tests/unit/input.test.js` additions; e2e in `settings.spec.js` (rebind, reload, press).

## Out of scope
Gyro steering changes.
