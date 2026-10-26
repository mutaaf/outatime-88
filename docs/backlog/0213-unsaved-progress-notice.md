---
id: 0213
title: A browser that cannot save tells the player once, instead of silently losing progress
status: ready
priority: P2
size: S
lens: tech-health
created: 2026-10-26
pr:
---

## Why
`SaveStore.save()` in `src/save.js` swallows storage errors. In a private window, with site
data blocked, or with a full quota, medals, unlocks, best times and the ghost vanish on
reload and the player never learns why. The offline layer already reads `navigator.storage`
(`src/offline.js`), so the knowledge exists. Reference:
https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria .

## What
`SaveStore.save()` records `SaveStore.persistFailed = true` when `setItem` throws. The next
title or results screen shows one dismissible line ("Progress can't be saved in this browser:
medals and times reset when you close the tab") using the existing announcer channel, once
per session. Play is never blocked.

## Acceptance criteria
- [ ] With `localStorage.setItem` throwing, the notice appears once per session on the results or title screen and is announced to screen readers
- [ ] With storage working, no notice and no new DOM
- [ ] The race, leaderboard posting and offline play are unchanged when storage is blocked
- [ ] No overlap with other HUD or title elements at 390x844 and 1280x720

## Test plan
Unit test: a throwing storage stub sets the flag, a working one does not. E2E: stub
`Storage.prototype.setItem` to throw, finish a race, assert the notice text once.

## Out of scope
Cloud sync, accounts, export/import of saves.
