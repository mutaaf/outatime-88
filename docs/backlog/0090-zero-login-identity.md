---
id: 0090
title: Zero-login identity — your racer follows you, siblings switch with one tap
status: in-progress
priority: P1
size: L
lens: content
created: 2026-10-17
pr:
---

## Why
Operator: "accounts should be imei, mac device id and network based instead of having
someone login". Browsers can't read IMEI/MAC, and IP/fingerprint identity breaks for siblings
on one home network and is a privacy problem for a kids' game. The intent — nobody ever logs
in, yet your racer, bests and friends stick — is delivered with a silent device credential.

## What
- Worker issues a random public id; the device holds a signed credential as an HttpOnly
  first-party cookie, mirrored to localStorage + IndexedDB, restored from any survivor.
- Server profile keyed by the public id: initials, car, friends, an extensible progression
  blob (`POST /api/me/data`); personal bests from the racer's runs. No PII, no stored IP.
- RACER panel from the title's stats chip: switch racer (shared iPad), new racer, link a
  device (6-char code + on-device QR, 10 min, single use, merges the device's runs), "Save
  my racer" recovery code, forget this device (two taps). `?link=CODE` deep link from the QR.
- `src/identity.js` + `src/worker/identity.js` for rooms, share links, friends and rivals.

## Acceptance criteria
- [x] Unit: credential sign/verify, cookie attributes, restore from header, forged → new
      racer, link single-use + expiry + merge, recovery replace, switch, forget, throttle,
      no address data kept, profile data merge/cap
- [x] Unit: QR codes decode back exactly (jsQR) for every link shape we use
- [x] e2e (real Worker handlers): cookie loss → restored from localStorage, then from
      IndexedDB; link code across two browser contexts via the QR deep link; switch racer
      keeps each save; forget takes two taps
- [x] e2e: racer panel has no overlaps, nothing off-screen and ≥44px targets on phones and
      tablets in both orientations
- [x] Privacy model documented in AGENTS.md

## Test plan
`tests/unit/worker-identity.test.js`, `tests/unit/qr.test.js`, `tests/e2e/identity.spec.js`
(routes /outatime/api/* to the real handlers over in-memory SQLite: `tests/e2e/backend.js`).

## Out of scope
Server-side sync of coins/upgrades (the garage feature owns its key in the profile blob).
