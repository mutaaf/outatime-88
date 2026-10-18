---
id: 0140
title: Sponsor boards — crisp ad-slot objects with kid-safe, first-party reporting
status: in-progress
priority: P1
size: M
lens: content
created: 2026-10-18
---

## Why
The user wants the billboards to be "their own intelligent objects that are so crisp so we
can actually monetize the space". Roadside signs were anonymous props drawn at the road
canvas's resolution, with no notion of a slot, a campaign or a view.

## What
- Board objects (`src/track.js` `addBoard`): start arch, checkpoint gantries, roadside boards,
  loop banners and booster-gate signs, each with a stable slot id, pooled with the ring,
  always off the road or overhead.
- `src/billboard-art.js` (lazy): house designs painted per size bucket, sponsor images from
  `public/ads/manifest.json`, contextual weighted rotation per (seed, level, slot, era), an
  LRU face cache, faces picked by device-pixel size on the device-pixel 2D road (0145), a 3D board pool with
  mipmapped anisotropic textures, viewability (50% / 0.25% / 1 s) and aggregate batches.
- docs/ADS.md: inventory, creative specs, the kid-safety policy, how to add a campaign.
- Reporting endpoint in `src/worker/` as a separate operator PR; `report` stays off until then.

## Acceptance criteria
- Every board kind appears on an endless road; none stands on the road surface.
- The same seed shows the same campaigns on the same boards.
- 2D faces are painted at their device-pixel width; 3D faces use mipmapped anisotropic textures.
- No request is made with reporting off; with it on, only `{ v, day, counts }` is sent.
- Main bundle stays within budget (art is a lazy chunk).

## Test plan
- `tests/unit/billboards.test.js`: placement, determinism, pooling, rotation filters,
  manifest validation (kid-safe, same-origin images only), buckets, viewability rules,
  aggregate batch shape.
- `tests/e2e/billboards.spec.js`: face bucket covers device-pixel width at 2× DPR, 3D boards pooled, batch posted
  only when reporting is on, nothing sent by default, missing manifest is fine.
