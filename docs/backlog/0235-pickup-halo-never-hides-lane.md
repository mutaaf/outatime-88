---
id: 0235
title: Pickup halo is capped so a near pickup never hides the traffic behind it
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-31
pr:
---

## Why
Playing 1280x720 the first seconds of a race: the NOS canister's white halo ring grows to
~170 px (a quarter of the road) as it nears the car and sits on top of a rival and a
hazard marker behind it. Readability pillar: clutter is a bug; a pickup should be easy to
see, not to the point of hiding the lane ahead.

## What
Cap the pickup halo's screen radius (e.g. 0.5x the pickup sprite's width, max ~64 px at
720p) and fade its alpha as it closes in. Touches the pickup draw path in `src/` (find
where the ring is drawn; do not restructure the renderer).

## Acceptance criteria
- [ ] Halo radius never exceeds the cap at 1280x720 or 390x844 (unit test on the radius function)
- [ ] The sprite itself is unchanged in size; collection range unchanged
- [ ] Reduced-motion: no growth animation at all

## Test plan
Unit test for the extracted radius function; screenshot check noted in the PR.

## Out of scope
Pickup colours (0198), popup text (0114).
