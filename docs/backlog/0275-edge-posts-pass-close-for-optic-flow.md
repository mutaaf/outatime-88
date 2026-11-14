---
id: 0275
title: Reflector posts stream past both road edges so empty stretches still feel fast
status: ready        # proposed | ready | in-progress | shipped | dropped
priority: P2         # P0 (broken/urgent) | P1 (next) | P2 (later)
size: M              # S (<1h) | M (one sitting) | L (split it if it touches >3 systems)
lens: player-feel    # player-feel | content | authenticity | performance | accessibility | tech-health
created: 2026-11-14
pr:
---

## Why
Pillar 2 (game feel): speed is read from things streaming past the camera, and a sparse
world reads as slow. Racing-design writing says the same: "to appear fast, you need to have
things rush past you" and cheap non-colliding objects passing close to the player sell it
(https://critpoints.net/2016/11/24/feeling-of-speed/ and
https://www.shawnhargreaves.com/blog/vrrroom-whoosh.html); the oldest example is Night Driver's
roadside markers (1976). Playing the desktop race (1280x720), the long stretches between
billboards and palms show only the road-surface stripes moving; the 2D road has no
close-to-camera edge detail. Nothing in `src/` draws delineator or reflector posts
(`grep -ri 'reflector\|delineator' src` is empty), so this is new.

## What
Draw short reflector posts along both road edges at a fixed world spacing (for example one
every 24 m per side, alternating sides by half a step), in `src/render/road.js`'s existing
per-segment pass or `src/scenes/roadside.js`, scaled by the same projection as the rails.
Post body takes the era's `railColor`; the reflector cap is a small emissive dot that
brightens in the headlight cone (a fixed palette, no flashing, steady in time so it needs no
reduced-motion variant). Spacing tightens slightly with speed is NOT allowed (it would look
like warping); spacing is constant, so speed alone changes the rate. Reuse a pooled array;
zero per-frame allocation (invariant 4). Cull beyond the existing draw distance. The 3D mode
gets the same posts as instanced meshes in `src/render3d/` only if it fits the same ticket
budget; otherwise leave it for a follow-up.

## Acceptance criteria
- [ ] In 2D at speed, posts appear on both edges in all 7 eras with that era's rail colour,
      and are absent when the era draws no guardrail (the 2061 skyway).
- [ ] The rate posts pass a fixed screen line equals `speed / spacing` within 5% (unit-test
      the pure spacing/phase function).
- [ ] No post draws over the player car, a pickup or a hazard label (draw order below
      sprites).
- [ ] e2e perf probe stays within budget on the existing 2D race, and a zero-allocation check
      on the new draw loop passes.
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; `main` startup budget unchanged
      (put the code in a lazy chunk or an existing render module, lesson 2026-11-14).

## Test plan
Unit: `postPhase(distance, spacing)` returns the same set of post world positions on repeat
and the expected count in a visible window. E2E: a screenshot-free probe that reads the new
draw counter at 80 mph in two eras and asserts >0 posts and <= the cap.

## Out of scope
Sound for the posts, gameplay effects (they never collide), per-era post shapes beyond colour.
