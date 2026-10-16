---
id: 0013
title: Analog touch steering and rebindable keyboard controls
status: ready
priority: P2
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
- [ ] Unit test: pointer offset → steer value is clamped, has a dead zone, and is symmetric
- [ ] e2e (hasTouch, 390x844): dragging right moves `playerX` right
- [ ] Rebound key persists across reload and drives the action
- [ ] Touch targets ≥ 44px

## Test plan
`tests/unit/input.test.js` additions; e2e in `mobile.spec.js`.

## Out of scope
Gyro steering changes.
