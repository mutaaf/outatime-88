---
id: 0204
title: Pause shows a one-screen controls reference for the active input
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-10-22
pr: 164
---

## Why
Controls are taught only by transient coach tips and bubbles (which can be dismissed, and
0201 proposes turning them off). A player who muted the coach, or returns after days, has
no place to re-read the keys, pad buttons or touch pads. Readability and onboarding lens.

## What
In the pause overlay add a compact "CONTROLS" panel listing steer/accelerate/brake/WARP/
NOS/jump for the detected input (keyboard using the rebound keys from 0013, gamepad, or
touch). Touches the pause markup in `index.html`, `src/keybinds.js` for labels, styles.

## Acceptance criteria
- [x] Pausing on keyboard shows the current (possibly rebound) key names
- [x] A gamepad shows button names, touch shows the pad names (WARP, NOS, DRIFT, JUMP)
- [x] Panel fits at 390x844 and 1280x720 with no overlap or scroll of the pause buttons

## Test plan
E2e: rebind a key, pause, assert the panel shows it; phone viewport screenshot assertion
on no overlap.

## Out of scope
A full tutorial; changing the coach.
