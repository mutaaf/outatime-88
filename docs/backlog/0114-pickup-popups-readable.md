---
id: 0114
title: Pickup and score popups read cleanly — never stacked on the player car or each other
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-18
pr:
---

## Why
Pillar 3 (readability). In a 1280x720 play-through on level 1, the "+25 💚 HP REPAIRED!"
pickup label (`spawnAcquireAnimation` in `src/main.js`) was drawn directly over the player
car's roof and rear window, in thin cyan on a pale car, so it was nearly unreadable and hid
the car at the moment the player is steering to grab the pickup. A faint, half-cut-off ghost
of another label also sat at the far left edge. Floating feedback should sit above the car,
fade fast, and have its own contrast plate. Floating text and flash/shake are standard juice
([Easton, "Where Does Game Feel Come From"](https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/)),
but only if the player can read it at a glance.

## What
Draw pickup/bonus labels from a fixed anchor above the car's roofline (not at the car's
centre), with a dark plate behind the text for ≥4.5:1 contrast, one label at a time per
anchor (a new label replaces or queues behind the old one), and clamp them to the screen so
nothing is drawn half off-edge. Touches the pickup draw code in `src/main.js` (or its carved
renderer module); keep the change size-neutral for the main bundle (see 0115).

## Acceptance criteria
- [ ] A pickup label never overlaps the player car's bounding box (unit test on the anchor maths)
- [ ] Two labels spawned within 300 ms do not overlap each other
- [ ] Label text is fully inside the canvas at 390x844 and 1280x720
- [ ] Screenshot at both sizes during a pickup shows the label above the car, legible
- [ ] No frame-time regression, no per-frame allocation added

## Test plan
Pure anchor/queue helper with a unit test; e2e screenshot-free assertion that no label
rectangle intersects the car rectangle (exposed through the `?debug` hook).

## Out of scope
Changing which pickups exist or their point values.
