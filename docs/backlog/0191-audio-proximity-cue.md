---
id: 0191
title: A panned proximity tick when traffic is about to hit you
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-20
pr:
---

## Why
Threats are readable only by eye today. Xbox Accessibility Guidelines advise pairing
critical visual information with spatial audio so no cue relies on a single channel:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103
Racing games do the same for low-vision players (F1 25 audio driving aids:
https://www.ea.com/sv-se/able/resources/f1-25). It also helps everyone on a bright phone
screen at 120 mph, and it feeds pillar 4 (Sound).

## What
In the audio module add a short, quiet tick, stereo-panned to the lane of the nearest
obstacle that will collide within ~0.8 s, rate-limited (max ~4 per second), on the SFX bus
under the master compressor. Off with Mute; a Settings toggle "Proximity cue" (default on).
No per-frame allocation: reuse nodes/buffers.

## Acceptance criteria
- [ ] Unit test: the cue chooser returns pan -1/0/+1 for obstacles left/centre/right and null when none is within 0.8 s
- [ ] Rate limit holds (≤ 4 cues in any 1 s window) in a unit test with a dense field
- [ ] Muted or toggled off: no oscillator/buffer source is started
- [ ] Never plays under `?debug` silent test mode; no frame-time regression (perf probe)

## Test plan
Pure-function unit test for the chooser and limiter; one e2e that the setting persists.

## Out of scope
A full audio-only mode; haptics (0007).
