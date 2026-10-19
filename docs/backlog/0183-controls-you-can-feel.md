---
id: 0183
title: Controls you can feel — analog pedals, a steady tilt, force-feel rumble
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr: 99
---

## Why
The user: "double down on the best controls and performance to make it realistic". Input
already reached the sim on the next frame, but a gamepad was a keyboard with a stick (on/off
triggers, a linear stick with a hard deadzone edge), tilt passed every twitch of the sensor
straight to the wheel, and nothing told your hands what the tyres were doing.

## What
- **Latency, measured** (input → the first frame whose steering reflects it, page clock,
  headless Chromium, 2D, `node latency.mjs`): keyboard, gamepad, touch and tilt all land on the
  next frame (p50 ≈ 13 ms at 60 Hz, ≈ 30–46 ms at 4× CPU throttle, i.e. one frame). The gamepad
  is polled every 120 Hz sim step and touch is sampled at the top of each frame, so nothing
  waits on a timer. The rest of "feel" latency is the car's own yaw response (~160 ms to 1° of
  body yaw at 70 mph), which is physics, not plumbing.
- **Gamepad** (`src/input.js`): a deadzone rescaled to start from zero, then a gentle response
  curve (exponent 1.35): finer near centre at 100 mph, full lock before the rim. RT/LT are
  analog throttle and brake (A/B a full press); the drivetrain scales thrust and brake bite by
  them (`throttleAmt`, `brakeAmt` in `src/drivetrain.js`), so feathering RT stops wheelspin on
  a launch. (Auto-gas, on by default, is a full press; analog throttle works with it off.)
  One reused result object instead of a new one every sim step.
- **Tilt** (`src/onefilter.js`, `src/settings-ui.js`): a One Euro filter on the sensor angle.
  On a simulated 60 Hz phone (0.5° noise + a 9 Hz tremor), steering jitter at rest drops from
  ~0.026 to ~0.008 of lock while a 100–250 ms swerve still reaches 90% within one sample.
  RECENTER (settings and the in-race tilt bar) uses the filtered angle, so a twitch on the tap
  never becomes the new centre. The tilt meter only restyles when it moves a whole percent.
- **Force feel** (`src/forcefeel.js`, lazy, loads when a gamepad connects or the touch kit
  loads): dual rumble like a wheel's force feedback. The light motor carries the tyres (slip
  past grip, wheelspin, a drift's scrub, a faint road texture at speed); the heavy motor the
  chassis (wall hits, grinding, hard landings, crashes). Phones get `wall`, `land` and `slip`
  pulses (`src/touch/haptics.js`). Off with the Haptics setting; calm mode keeps only the tyres
  at half strength.

## Acceptance criteria
- Keyboard, gamepad and tilt move the steering within 2 frames of the input (e2e, counted in
  frames).
- Half RT pulls 30–70% as hard as full RT (e2e, drivetrain's own acceleration).
- A held tilt with sensor noise moves the wheel < 0.015 RMS (e2e); unit tests prove the filter
  halves jitter and follows a quick swerve within a sample.
- A wall hit at speed sends a heavy-motor rumble > 0.5, a drift a light-motor rumble > 0.2, and
  the motors stop when paused (e2e with a fake actuator).
- Main bundle stays in budget; the force-feel code is its own chunk.

## Test plan
- Unit: `tests/unit/input.test.js`, `onefilter.test.js`, `forcefeel.test.js`, `drivetrain.test.js`.
- E2E: `tests/e2e/controls-feel.spec.js`; budget spec.
- On a device: an Xbox/PlayStation pad in Chrome (rumble), an Android phone (pulses), tilt on
  an iPhone in landscape both ways round.
