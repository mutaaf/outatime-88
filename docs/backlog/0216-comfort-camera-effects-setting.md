---
id: 0216
title: A "Camera effects" comfort setting separates shake and FOV kick from every other motion
status: shipped
priority: P2
size: M
lens: accessibility
created: 2026-10-27
pr: 181
---

## Why
Today the only motion control is Settings → motion (`auto | reduce | full`, `reducedMotionFor`
in `src/settings.js`): one switch calms shakes *and* flashes *and* everything else. A player who
gets queasy from camera shake and FOV push-in at 88 mph still wants the speed lines and the
warp's colour shift, and a player with an OS-level reduce flag gets no say over which parts go.
Xbox Accessibility Guideline 117 asks games to let players tune camera shake, head bob, motion
blur and automatic camera moves separately, because those drive motion sickness
(https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117); racers such
as Hotshot Racing list "No Screen Shake" as its own option
(https://www.familygamingdatabase.com/accessibility/Hotshot+Racing).

## What
Add `cameraFx: 'full' | 'gentle' | 'off'` (default `'full'`; `'auto'` is not needed because
`motion: reduce` already forces `off`) to `SaveStore.data.settings`, normalised in
`src/settings.js` with a unit-tested `cameraFxScale(settings, systemReduce)` returning 1 / 0.4 / 0.
The renderer multiplies screen shake amplitude, hit-shake, FOV kick and NOS/warp push-in by it
(`src/render/scene.js`, `src/render/fx.js`; 3D view reads the same scale). Flashes, speed lines
and the warp colour shift are untouched. A row in the lazy settings panel (VIEW section), no
change to the sim and nothing in main beyond the one scale read.

## Acceptance criteria
- [x] `cameraFx: 'off'` leaves the canvas shake offset at 0 and FOV kick at 1.0 through a crash, a NOS burn and a warp; `'gentle'` is ≈40% of `'full'`.
- [x] `motion: 'reduce'` (or OS reduce with `auto`) still forces the scale to 0 whatever `cameraFx` says.
- [x] Speed lines, flash guard (0188) and the sim are unchanged: a seeded race ends with identical score and time in all three modes.
- [x] Old saves (no `cameraFx`) load as `'full'`; no save key changes (invariant 6).
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse; main startup JS stays ≤ 59 kB gz (put the row in the lazy settings chunk).

As shipped (#181): the scale is `cameraFxScale(mode)` in `src/camera-fx.js` (lazy settings-panel
chunk, which loads at boot when a save calms the camera) and lands on `GameState.cameraFx`. Calm
motion wins through the renderers' existing `reducedMotion` gates rather than being folded into
the scale, so an OS reduce flag that turns off mid-session never leaves the camera stuck calm.
Sim parity holds by construction: no sim module reads `cameraFx` (unit-tested).

## Test plan
Unit: `cameraFxScale` table (modes × reduce flags) and `normalise` defaults on an old-shape save.
E2E (`tests/e2e/settings.spec.js`): set each mode via the panel, force a crash with `__OT`, read
the shake offset/FOV from `GameState` and assert 0 / reduced / full; compare a seeded sim result.

## Out of scope
Motion blur, head bob, a slider with more than three steps, 3D-only camera modes.
