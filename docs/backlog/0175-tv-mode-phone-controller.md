---
id: 0175
title: TV mode — the game on the big screen, a phone as the tilt controller
status: in-progress
priority: P1
size: L
lens: player-feel
created: 2026-10-18
pr:
---

## Why
The user wants to "play this on tv using my iphone as the tilt controller", in the style of Wii,
Jackbox or AirConsole. Mirroring a phone to the TV works but lags, and the player ends up
watching the phone. A phone that is only a controller, with the TV running the game, feels
like a console.

## What
- `?tv` (or `?screen=tv`) shows a 10-foot pairing screen: a big code plus a locally drawn QR.
- The QR opens `pad.html`, the phone controller:
  - tilt like a wheel, with expo and calibration, or drag-steer;
  - GAS, BRAKE, NOS, BOOST, START/PAUSE and FIT TV;
  - wake lock, full screen and landscape lock where allowed;
  - haptics, a mini HUD, and a co-pilot second phone.
- Transport (`src/tv/link.js`): a WebRTC DataChannel when phone and TV share a network, otherwise
  the PadRoom relay (operator PR, `src/worker/pad.js`).
- Wire format and steering math: `src/tv/proto.js`.
- The TV feeds `PhonePad` (`src/input.js`), the gamepad path.
- A lost phone pauses the race. Overscan-safe scaling is available. All TV code is lazy.

## Acceptance criteria
- [x] The TV QR decodes to `…/outatime/?pad=CODE`, and the phone lands on the controller.
- [x] ▶ on the phone starts the race; GAS speeds the TV car up; tilting right or left moves it that way.
- [x] It works over P2P and with WebRTC disabled (relay ≤ 30 Hz).
- [x] Closing the phone pauses the TV race with a banner; ▶ pauses and resumes.
- [x] A wrong code tells the phone what to do.
- [x] The main bundle doesn't grow beyond the tiny hook; no third-party hosts.

## Test plan
- Unit: `tests/unit/tv-proto.test.js` (frames, taps, wheel curve, hold/release) and
  `tests/unit/pad-room.test.js` (pairing rules, relay routing, rate limit).
- E2E: `tests/e2e/tv.spec.js`, two browser contexts against `wrangler dev`, covering pairing by QR,
  start, gas, steering both ways, pause and resume, disconnect, the relay path and a bad code.
- On hardware: an iPhone with a laptop on HDMI, then Fire TV Silk and an iPad over AirPlay (see docs/TV.md).
