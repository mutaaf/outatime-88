---
id: 0232
title: A first-time player's title chip shows "BEST —", not a lonely "BEST 0"
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-31
pr:
---

## Why
Scout play-through, 1280x720 and 390x844, fresh profile: the pill under the tagline reads `RACER | BEST 0 | ⚡250`. A zero score reads like a failure or a bug on the very first screen. Until a run has finished there is no best to show; a dash says "nothing yet" without scolding, and the chip is the first thing a kid sees under the logo.

## What
In `src/main.js` (`renderRacerPill`, line ~1659, and the refresh at ~1625) show `—` in `#titleBestScore` while `SaveStore.data.bestScore` is 0, and the number afterwards. Keep the element and its id, so no layout or test selector changes. Add `aria-label` text ("No best score yet") on the chip while it is a dash so screen readers do not read "dash".

## Acceptance criteria
- [ ] Fresh save: `#titleBestScore` text is `—`; after finishing a race with a score the title shows that number.
- [ ] An existing save with a best score looks exactly as before.
- [ ] No layout shift of the chip at 390x844, 844x390 or 1280x720 (screenshot check).
- [ ] No save-format change (invariant 6).

## Test plan
E2E (extend the existing title/save round-trip spec): clean context → text `—`; seed a save with `bestScore: 1234` → `1,234`. Take 390x844 and 1280x720 screenshots and look at them.

## Out of scope
The Ranks board's "YOUR BEST" counter, the home hooks, any wording change on the chip beyond the number.
