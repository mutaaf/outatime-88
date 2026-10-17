---
id: 0061
title: Fortnite/Roblox-quality touch controls — thumbstick, D-pad, action arc, layout editor
status: shipped
priority: P0
size: L
lens: player-feel
created: 2026-10-17
pr: 33
---

## Why
The operator: "a major feature and super important that needs to be superiorly done: fortnite
like joystick and multi touch joystick for d pad and actions short cuts". Kids know Roblox and
Fortnite mobile controls; two digital arrow pads (0021) and single-touch handlers felt like a
web page, not a game. Supersedes the touch half of 0013.

## What
`src/touch/`: one full-screen Pointer Events surface with per-pointer capture, so any number of
fingers work at once.
- Movement: Roblox dynamic thumbstick (default, appears under the thumb anywhere in the lower
  left), Fortnite floating stick, fixed stick, 8-way multi-touch D-pad, tilt. Radial dead zone,
  response curve, dynamic recentering, analog steering with kid-tuned smoothing, optional stick
  throttle, haptics.
- Actions: a primary WARP button with satellites (DRIFT, JUMP, SPECIAL, GAS when auto-accelerate
  is off, HONK) — hold, tap, and slide from one button onto the next; cooldown/charge rings;
  long-press SPECIAL for a ZONE/AGRO/ROAR picker. Shortcuts: PAUSE, LOOK BACK (2D rear-view
  mirror; `InputState.lookBack` for 3D), CAMERA, RESET.
- Right-side free drag: 3D look-around + pinch zoom (`InputState.lookYaw/lookPitch/lookZoom`,
  springs back); 2D hold-drag looks back; quick flicks keep the old swipe tricks.
- Presets: Default, Roblox, Fortnite, Left-handed, Claw, Tablet — each solved per screen so it
  never overlaps itself, the HUD, the message lane or the edges.
- Controls panel (🎮 on the title and in the pause/garage screen): movement mode, preset, feel
  sliders, toggles, one-tap "Edit HUD layout" editor (drag, resize, opacity, hide, snap,
  reset; saved per device class and orientation). First-race thumb guide, replayable.
- No accidental zoom, scroll, callouts or back-navigation: `touch-action: none`, gesture
  guards, and the back gesture pauses instead of leaving mid-race.

## Acceptance criteria
- [x] Unit: stick dead zone/curve/symmetry/recentering, 8-way D-pad quantisation, smoothing, slide-between-buttons, every preset × viewport × safe area has no problems
- [x] e2e multi-touch (CDP): steer + drift + warp at once; slide JUMP→WARP; two-finger D-pad; long-press picker; cancel releases all; mirror
- [x] e2e: every preset fits every phone/tablet viewport in both orientations (screenshots attached)
- [x] Layout editor persists across reload and refuses overlapping drops
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse (desktop keeps keyboard, controls appear on first touch)

## Test plan
`tests/unit/touch.test.js`, `tests/e2e/touch.spec.js`, `tests/e2e/touch-layouts.spec.js`;
`layout.spec.js` and `mobile.spec.js` updated for the new controls.

## Out of scope
Rebindable keyboard keys (still 0013). The 3D renderer's camera reads the look fields; wiring
that is the 3D mode's job.
