---
id: 0242
title: Fork banners (SKY-LOOP / TUNNEL) never sit on top of a gantry sign or billboard text
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-02
pr: 219
---

## Why
Scout play-through at 1280x720 (vite preview, ~9 s into a first race): the two fork
banners "◀ SKY-LOOP ⚡" and "TUNNEL ⏱ ▶" hover at the horizon directly over the
"BEAT THE BOARD / NEW SEASON EVERY MONDAY" gantry sign and the distant
"BIJOU TONIGHT" boards, so the fork choice (a decision the player has about two
seconds to make) is read against competing small text. Pillar 3: one thing to read at
a time; clutter is a bug. Contrast guidance (WCAG 1.4.3, https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
asks text over varied imagery to keep a solid backing. 0019 and 0220 solved banner vs.
nameplate and label lanes, but not banner vs. baked backdrop signs.

## What
Give the fork banners an opaque-enough backing (the same plate treatment the 0220 label
lane uses) and, where the banner box overlaps a roadside gantry sign drawn by the
renderer, nudge the banner's y above or below the sign box (never sideways onto the
other banner). Touches the fork-banner draw in `src/render/` and `src/track.js` only
for the sign's box if it is not already exposed.

## Acceptance criteria
- [ ] With a fork in view at 1280x720 and 390x844, neither banner's box intersects a
      gantry/sponsor sign box on screen
- [ ] Both banners keep contrast >= 4.5:1 against their own backing
- [ ] Banner text and arrows unchanged; the two banners still never overlap each other
- [ ] No frame-time regression (e2e perf probe within budget); race chunk stays under
      its budget (check `gzip -9`, kB = 1024)

## Test plan
Unit test for the nudge helper (box vs. sign box, above/below choice, no-sign case).
Small own e2e spec (not appended to a big spec, see LESSONS 2026-10-31) that places a
fork in view and asserts the on-screen boxes do not intersect at both viewports.

## Out of scope
Redrawing the signs, changing fork timing, or the 3D renderer's banners.

## Shipped notes (2026-11-02)
The cards are now opaque (no see-through backing; the branch you aren't lined up for dims with
`brightness(0.82)` instead of fading), and a 2D board whose face lies under a card draws
see-through (the 0203 fade, `src/board-fade.js` cueCovers/forkCueBox, measured once per cue
change in `src/billboard-art.js`) instead of the banner being nudged up or down. A nudge would
chase growing boards and move the cue during the two-second choice; the fade keeps the cue still
and makes it the one text there. Measured: on a 390x844 portrait screen no 2D board reaches the
cue while the fork is underfoot (a gantry's face stays in the lower half), so there the backing
does the work against the skyline. Tests: tests/unit/fork.test.js + board-fade.test.js (0242),
tests/e2e/fork-signs.spec.js.
