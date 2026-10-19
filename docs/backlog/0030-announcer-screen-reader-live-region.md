---
id: 0030
title: Announcements and race calls reach screen readers (aria-live) without spamming them
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-17
pr:
---

## Why
Invariant 8 asks for an accessibility floor. The single announcement channel
(`#announcerMain`/`#announcerSub` in `index.html`) is the game's one place for "FINAL LAP",
"WARP READY", fork and mission news, but it has no `role`/`aria-live`, so blind and
low-vision players hear none of it; the HUD position card has `role="status"` but changes
every frame-ish. WCAG 4.1.3 Status Messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html

## What
Make the announcer container a polite live region (`role="status" aria-live="polite"
aria-atomic="true"`) and have `src/announcer.js` write text once per announcement (not per
fade frame). Make the position card announce only on place *changes* (a throttled
visually-hidden live line), never the speed/timer. Respect the existing priority queue so
two messages never fire in one tick.

## Acceptance criteria
- [ ] `#announcerContainer` has a polite live region; text changes exactly once per announcement
- [ ] A visually hidden live line announces "Now 3rd of 6" on place change, at most once per 2 s
- [ ] No visual change at 390x844 or 1280x720; zero-overlap layout e2e still green
- [ ] No per-frame DOM writes added (change-only writes, invariant 4)

## Test plan
Extend `tests/unit/announcer.test.js` (one DOM write per message) and `tests/e2e/hud.spec.js`
(live region attributes exist; place-change line updates and is throttled).

## Out of scope
Full screen-reader play of the race; voice-over of the road.
