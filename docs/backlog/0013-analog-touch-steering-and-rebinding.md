---
id: 0013
title: Rebindable keyboard controls (analog touch steering already shipped in 0061)
status: shipped
priority: P2
# Groomed 2026-10-17: the touch half shipped with 0061 (thumbstick, dead zone, layouts); only keyboard rebinding remains. Gamepad rumble/glyphs live in 0007.
size: M
lens: player-feel
created: 2026-10-16
pr: 144
---

## Why
Pillar 6. On phones steering is two digital arrow buttons; analog drag-steering (thumb
position → steer amount) feels far better. Keyboard players need rebinding (AZERTY, left-handed).

> Narrowed 2026-10-19: analog drag steering shipped (0061); only keyboard rebinding remains.

## What
A small controls panel to rebind keys, stored under new save
fields with defaults.

## Acceptance criteria
- [x] Unit test: a binding table maps key codes to actions; defaults match today (A/D/arrows, Space, etc.); conflicts are rejected
- [x] Rebound key persists across reload and drives the action
- [x] Touch targets ≥ 44px

## Test plan
`tests/unit/input.test.js` additions; e2e in `settings.spec.js` (rebind, reload, press).

## Out of scope
Gyro steering changes.
