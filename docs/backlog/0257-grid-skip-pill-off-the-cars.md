---
id: 0257
title: The grid "PRESS ENTER TO SKIP" pill never sits on the cars in the line-up
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-11-10
pr:
---

## Why
Scout run 2026-11-10: at 1280x720 on the start grid, the driver intro card
(VEX & ION ARDEN) and the "PRESS ENTER TO SKIP" pill stack in the screen centre, and the
pill lands on the rival cars beside the player (about y=427). On the grid the player is
meant to read the line-up and the lights; two centred cards cover exactly that. Readability
pillar: one announcement, kept clear of the road.

## What
Dock the skip pill to a fixed edge slot (bottom-centre under the player car's shadow,
or beside the intro card's lower edge, whichever clears cars at 1280x720 and 390x844) in
the grid/intro overlay code (`src/racecall.js` and its CSS). Text is unchanged.

## Acceptance criteria
- [ ] At 1280x720 keyboard and 390x844 touch, the skip pill's box does not intersect the
      player car or any rival car box during the intro.
- [ ] The pill never overlaps the intro card, HUD cards or touch pads.
- [ ] Wording per input is unchanged (keys / pad / phone / touch).
- [ ] The pill still skips on its input.

## Test plan
In the grid e2e, read the pill rect and the on-screen car rects (published car boxes or
the card rects) at both sizes and assert no intersection; assert skip still works.

## Out of scope
Rewording the intro, changing skip behaviour or timing.
