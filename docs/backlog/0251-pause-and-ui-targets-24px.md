---
id: 0251
title: Every tappable control on the phone HUD is at least 24x24 CSS px (WCAG 2.5.8)
status: shipped
priority: P2
size: M
lens: accessibility
created: 2026-11-05
pr: 235
---

## Why
WCAG 2.2 SC 2.5.8 (AA) asks pointer targets to be at least 24x24 CSS px or have 24 px
spacing: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (summarised
at https://dequeuniversity.com/rules/axe/4.8/target-size). The phone HUD packs the gear,
joystick label, camera, retry, pause, ROAR/JUMP/DRIFT/NOS/WARP and a `JOYSTICK` chip into
390 px; some chips look small. Nothing audits it today.

## What
Add an e2e that walks every visible interactive element during a phone run and the title
screen at 390x844 and 844x390, fails under 24x24 unless the spacing exception holds, and
fix offenders with padding (hit area only, no visual redesign). Touches `src/styles.css`,
`src/touch/`, new spec.

## Acceptance criteria
- [ ] New e2e reports zero offenders at 390x844 and 844x390 (title, grid, mid-run, pause)
- [ ] No visual layout change beyond invisible padding
- [ ] 1280x720 unchanged

## Test plan
`tests/e2e/target-size.spec.js`: query buttons/[role=button]/inputs, assert bounding boxes.

## Out of scope
Raising everything to 44 px (AAA).
