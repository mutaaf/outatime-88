---
id: 0236
title: Era cinema/shop marquees show whole words or fade out, never a mid-word clip
status: shipped
priority: P2
size: S
lens: content
created: 2026-10-31
pr: 209
---

## Why
On a 390x844 phone the first seconds show a roadside marquee reading "ALIENS FROM PLUTO II
/ ATTACK OF THE 50 FT M" cut off mid-word at the screen edge. 0221 fixed this for sponsor
boards only; the in-world era props still clip. Looks like a bug on the phone's hero shot.

## What
Apply the same whole-or-faded rule 0221 introduced to in-world prop text (cinema and shop
signs in `src/scenes/` / `src/billboard-art.js`): measure, drop trailing words that don't
fit, or fade the sign out while any word would clip.

## Acceptance criteria
- [x] A unit test over every era sign string at the narrowest sign width: output never ends mid-word
- [x] No new per-frame allocation (precompute at scene build)
- [x] Existing sign art tests still pass

## Test plan
tests/unit sign-text test iterating the sign strings from the scene data.

## Out of scope
Rewriting sign copy (see 0189 for the IP audit).

## Notes (build)
- `sign()` in `src/scenes/kit.js` takes the `maxW` of the board it is painted on. Text that doesn't
  fit first gets a smaller font (down to 4 px in the layer, which is drawn scaled up), then loses
  trailing words, never ending on a separator or a linking word (`fitWords`: "GULCH OF NO NAME" →
  "GULCH"); if no word fits the sign stays blank. `alt` is a shorter wording shown whole instead
  (the 2015 rain countdown falls back to "12s", never "RAIN ENDS IN"). All at scene build.
- Every `sign()` call in the seven era scenes passes its box. Boxes that the text overran at the
  high tier were widened instead of cutting copy: the GULCH board (9u → 13u), the SAVE OUR CLOCK
  TOWER kiosk (0.6 → 0.8 of the shop), the 2015 forecast sprite (14u → 15u, matching its 16u board);
  "VHS · LASERDISC" uses a smaller font (2.2u) to fit its 16u shop.
- At the high tier every sign shows in full at 1280x720 and 390x844 (unit test). Small layers
  (low tier, landscape phones) lose trailing words.
- Not covered: backdrop layers pan with steering and curves, so a sign near the screen's edge can
  still be cut by the edge itself for a moment, like every other piece of scenery there. Fading
  baked layer text per frame needs the sign rects in the layer plus a per-frame pass; a follow-up
  ticket if the scout still sees it.
