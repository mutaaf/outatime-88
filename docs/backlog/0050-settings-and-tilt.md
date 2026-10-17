---
id: 0050
title: Settings you can find — a gear on the title and in the race, and one-tap tilt
status: shipped
priority: P1
size: M
lens: accessibility
created: 2026-10-17
pr: 0
---

## Why
Kid playtest (2026-10-17, via the operator): tilt and game settings were too hard to turn on.
Tilt lived behind EVENTS → a small button, iOS permission failures were a silent toast, one
landscape rotation steered backwards, and volume/difficulty/motion had no home.

## What
- `src/settings.js` (pure): defaults + `normalizeSettings` (saved under `SaveStore.data.settings`,
  merged on load per invariant 6), difficulty table (rival pace, damage), reduced-motion
  resolution (auto/calm/full), tilt maths (`screenAngle`, `tiltAngle`, `tiltSteer`) and status text.
- `src/settings-ui.js`: the panel (`#settingsModal`), gears on the title (`#btnOpenSettings`),
  HUD (`#btnHudSettings`, pauses) and garage; the title `#btnTitleTilt` chip on touch screens;
  the iOS `requestPermission` call made inside the tap; recenter, sensitivity, invert; a 1.5 s
  "no sensor" watchdog; `registerControlsEditor(open)` shows EDIT CONTROLS for the touch-controls
  editor to hook into.
- Music and SFX buses get their own levels (`SoundEngine.setMix`).
- A pause now really freezes the road (it used to keep scrolling behind the garage).

## Acceptance criteria
- [x] Gear on title and in the race HUD; opening it mid-race pauses, RESUME/Escape carries on
- [x] One tap on the title TILT chip asks iOS once and steers; denied and no-sensor say so plainly
- [x] Both landscape rotations steer the same way; invert and recenter work
- [x] Settings persist across reload; old saves load with defaults
- [x] Works at 820x1180 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/settings.test.js` (normalisation, difficulty, motion, tilt maths incl. rotation and
wrap-around, save compatibility); `tests/e2e/settings.spec.js` (title gear + reload, HUD gear
pauses, iPad permission granted/denied, no-sensor watchdog).

## Out of scope
Touch control placement and the layout editor (separate controls work hooks into EDIT CONTROLS).
