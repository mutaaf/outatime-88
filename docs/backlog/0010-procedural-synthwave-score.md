---
id: 0010
title: Procedural synthwave score on the audio clock that intensifies with speed and changes per era
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-16
pr:
---

## Why
Pillar 4. The current music is an 8-step `setInterval` beep loop (jittery timing, no drums,
same everywhere). A lookahead sequencer scheduled on `AudioContext.currentTime` ("A Tale of
Two Clocks", https://web.dev/articles/audio-scheduling) gives tight timing; layering drums,
bass, arp and pads by speed tier makes approaching 88 *sound* like a climax.

## What
`src/music.js`: pure pattern tables per era (scale, tempo, patterns) + `layersFor(speed,
warpActive)` + a scheduler that queues notes ~100 ms ahead. Synthesized only (oscillators,
noise buffer for drums). Routes into the music bus from 0006. Replaces `startMusicLoop`.

## Acceptance criteria
- [ ] Unit tests: `layersFor` adds layers as speed rises (drums ≥ 0, bass ≥ 30, arp ≥ 60, lead/pad ≥ 86); every era has a valid pattern table
- [ ] Unit test with a fake AudioContext: scheduler only schedules notes within the lookahead window and never in the past
- [ ] Mute still silences everything and persists (existing e2e/unit behaviour)
- [ ] No console errors when audio is blocked by autoplay policy

## Test plan
`tests/unit/music.test.js` with a recording fake context.

## Out of scope
Sampled audio files (everything stays synthesized; zero external hosts).
