---
id: 0019
title: Declutter the road — fork labels, coach card and rival nameplates fight for the same space
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-17
pr: 67
---

## Why
Pillar 3: clutter is a bug. In a 1280x720 playthrough 6 s into level 1 (96 mph), the screen
simultaneously showed the coach card ("LOW LASER"), two large fork banners (left/right with
long text), two overlapping rival nameplates over the same car, plus the full top HUD. On
390x844 the faded "BLOCKED JUMP…" announcement sits over the road and a rival nameplate
overlaps the other car's name, both hard to read. Ticket 0002 fixed announcements and the
coach, but fork banners and world nameplates bypass that single channel.
Reference: HUD clutter guidance, https://www.gamedeveloper.com/design/hud-design-showing-just-enough

## What
Route fork choices through the announcer lane (or a compact two-arrow indicator with a
1–2 word label each) and suppress the coach while a fork is pending. In the renderer,
draw rival nameplates only for the nearest ~2 rivals, skip a plate when it would overlap an
already-drawn one, and fade plates out beyond a distance and above ~110 mph. Touches
`src/main.js` (fork UI, nameplate drawing), `src/announcer.js`, `index.html`.

## Acceptance criteria
- [x] At most one banner-sized text element is visible at any time during play (the fork is
      two compact arrows, a word each; the coach waits while a fork is pending)
- [x] Nameplate bounding boxes never overlap in a unit-testable placement helper (shipped in
      0101: `drawTags` in src/scenes/roadside.js, tests/unit/roadside.test.js)
- [x] Fork choice remains readable at 390x844 without covering the player car
- [x] No frame-time regression (e2e perf probe within budget); no per-frame allocations added
      (the cue's DOM is now written only when its state changes, not every sim step)

## Test plan
Unit test for the nameplate placement helper (overlap rejection, nearest-N). Extend
`tests/e2e/hud.spec.js`: during a fork, count visible banner elements and assert ≤ 1.

## Out of scope
Redesigning the top HUD panels; new announcement types.
