---
id: 0006
title: Add a bus compressor and per-bus volumes so SFX never clip over music
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-16
pr: 4
---

## Why
`SoundEngine` routes everything straight into one `masterGain` → destination. Crashes,
takedowns and the 88 mph warp stack on the music loop and engine drone and clip harshly on
laptop speakers. A compressor/limiter plus music/SFX/engine buses is the standard Web Audio fix
(https://developer.mozilla.org/docs/Web/API/DynamicsCompressorNode).

## What
In `src/audio.js`: create `musicBus`, `sfxBus`, `engineBus` gains → `DynamicsCompressorNode`
→ `masterGain`. Route existing sounds to the right bus. Keep the mute/volume behaviour and
saved `volume`/`muted` fields unchanged.

## Acceptance criteria
- [ ] Unit test with a minimal fake AudioContext asserts the graph: each bus → compressor → master → destination
- [ ] Mute still silences everything and persists across reload (existing behaviour)
- [ ] No console errors when audio is blocked by autoplay policy

## Test plan
`tests/unit/audio.test.js` stubs `window.AudioContext` with a recording fake and checks `connect`
calls after `SoundEngine.init()`.

## Out of scope
New music or sound effects.
