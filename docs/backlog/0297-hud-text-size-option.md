---
id: 0297
title: Settings → HUD size: NORMAL or LARGE for the race readouts
status: shipped
priority: P2
size: M
lens: accessibility
created: 2026-11-21
pr: 303
---

## Why
0267 set a floor for in-race HUD text, but a phone is held at arm's length and low-vision players
cannot raise the floor. WCAG 1.4.4 (resize text) and the Game Accessibility Guidelines both list
adjustable text size as a basic feature: https://gameaccessibilityguidelines.com/ensure-that-all-text-is-adjustable-in-size/
and https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html .

## What
A Settings choice HUD SIZE: NORMAL | LARGE, saved as `settings.hudScale` (default NORMAL, old saves
unchanged). LARGE sets a CSS custom property that scales the position, timer, speed readout, meter
captions and coach-bubble text by about 1.25x, with panels reflowing rather than overlapping.
Touches `src/hud.js` styles, the settings panel and `src/save.js` defaults.

As shipped: the setting itself already existed (0195: `settings.hud` 'normal' | 'large', persisted, place / lap /
gaps / clock / mph at 1.3x), so this ticket kept that key (invariant 6: no second name for one setting) and closed
the gap 0195 left: the small print beside those numbers stayed at NORMAL size. In LARGE now:
- the SPD / FLUX / NOS bar captions and the flux label + score line under the mph read a new `--hs` on `.race-hud`
  (1.3x; the bars sit a caption's height apart, the line is 1.2em so it adds no height);
- the coach tip grows ~1.25x in each of its layouts: the centred card (GOT IT 11 -> 14 px, never shrunk; the
  keys-only card may widen to min(360px, 30vw)), the phone line (15 px, clamped at 3 lines, not 2, so the longest
  tips stay whole at 320 px) and the desktop chip (0229; GOT IT shows as its ✓ there, so the chip keeps its width).
Exceptions where the HUD row is full, measured rather than assumed: 320-349 px upright phones get 1.1x (the most that
keeps "⚡ WARP READY" and a 7-digit score on one line each); phones on their side under 700 px wide keep the small
print at 1x, and the 0225 docked phone chip keeps its 10 px two-line tip: that row is full both ways (0195 already
drops the strip on the smallest) and a wider speed card takes the chip's room. CSS only, no JS.

## Acceptance criteria
- [x] LARGE grows the measured HUD font sizes by >= 20% and persists across reload (0195 for the numbers and
      persistence; captions, score line and coach tip here, with the 320-349 px portrait (1.1x) and < 700 px landscape
      (1x) exceptions above)
- [x] Zero overlaps and no clipped text at 320x568, 390x844 and 667x375 in LARGE (hud-size.spec.js, worst-case text and
      the longest tips, plus 360x800, 844x390, 1280x720 and 1366x768 with the desktop chip; 0195's grid still passes)
- [x] The speed readout, position and warp banner stay clear of touch controls (0195's touch test, plus pads vs HUD
      blocks and the coach here)
- [x] No frame-time regression; main startup size does not grow beyond 0.1 kB gz (CSS only; main JS unchanged)

## Test plan
Unit: default and normalisation of `hudScale`. E2E `hud-size.spec.js`: toggle, measure fonts, run the overlap check at the three viewports.

## Out of scope
Scaling menus or the results card, a free slider, touch-control sizing.
