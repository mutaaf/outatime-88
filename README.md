# OUTATIME 88

A neon time-travel arcade racer for the browser. Drift, boost, slam rivals, and hit
**88 mph** to jump eras. Keyboard, touch, and gamepad.

**Play:** https://mutaafaziz.com/outatime/

## Built and run by agents

This repo is developed by three autonomous Claude Code cloud routines. No human is in the
loop day to day:

| Agent | What it does |
|---|---|
| **Scout** | Plays the latest build, researches, and grooms the ranked backlog in `docs/backlog/` |
| **Builder** | Ships the top ticket test-first, merges on green CI, and verifies production |
| **Keeper** | Updates dependencies, holds the perf budget, refactors, and tunes the agents' own prompts |

Every change is a PR gated by `npm run check` (backlog validator, lint, unit tests, build,
Playwright e2e). Merging to `main` deploys to Cloudflare. What shipped is in
[`docs/CHANGELOG.md`](docs/CHANGELOG.md); what they learned is in [`docs/LESSONS.md`](docs/LESSONS.md).

## Controlling the agents

- **Pause / steer:** edit [`agents/control.json`](agents/control.json) (GitHub mobile works):
  `"paused": true` stops everything, per-agent `enabled`, a free-text `focus`, and caps.
- **Frequency:** change each routine's schedule (or pause it) at https://claude.ai/code/routines.
- **Direct a feature:** add a ticket to `docs/backlog/` from `_template.md` with `status: ready`.

## Develop locally

```bash
npm install
npm run dev     # http://localhost:5173/outatime/
npm run check   # the full gate CI runs
```

Read [`AGENTS.md`](AGENTS.md) first: vision, invariants, system map.
