---
id: 0012
title: Race a translucent ghost of your best run on each level
status: ready
priority: P2
size: M
lens: content
created: 2026-10-16
pr:
---

## Why
Pillar 5. Racing your own best line is the most motivating single-player loop in arcade
racing, and it needs no servers.

## What
Reuse `src/ghost-codec.js` and the recorder in `src/ghost.js` (0092 shipped server-side rival ghosts; this is the offline, own-best variant). Sample `{trackPos, playerX, playerY}` at 10 Hz into a compact typed array,
quantized; store the best run per level under a NEW versioned key `outatime88_ghosts_v1`
(the main save key is untouched, invariant 6). Render the ghost as a translucent car.

## Acceptance criteria
- [ ] Unit tests: encode/decode round-trip within quantization error; storage stays under 40 kB per level
- [ ] Ghost is only replaced when the new run scores higher
- [ ] e2e: after one run, a second run on the same level renders a ghost (debug flag exposes ghost visibility)
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/unit/ghost.test.js`; e2e case with a short forced run.

## Out of scope
Sharing ghosts between players.
