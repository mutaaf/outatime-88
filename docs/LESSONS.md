# Lessons

Mistakes already paid for. Read before working; append a row when you learn one (newest last).

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-16 | Lint for `no-undef` after every carve | Porting the single file into ES modules surfaced `obsSpacing` referenced in an `if (false)` block; sloppy-mode inline scripts hid it. `npm run lint` now catches any identifier left behind when moving code between modules. |
| 2026-10-16 | Module bindings are read-only | Imported names (`GameState`, `InputState`, data tables) can be mutated property-by-property but never reassigned. Keep shared state as objects; never `GameState = {...}`. |
| 2026-10-16 | Base path everywhere | The app lives at `/outatime/`. A root-absolute URL works in `npm run dev` habits but 404s in production; use imports or `import.meta.env.BASE_URL`. |
| 2026-10-16 | Local e2e: use the headless shell, not full Chromium | `/opt/pw-browsers/chromium` is full Chrome. It requests `/favicon.ico` (we ship none), which 404s and trips the console-error guard, even on main. Point a throwaway config's `launchOptions.executablePath` at `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (what CI uses) and all e2e pass. |
| 2026-10-16 | **Auto-merge can stall on a CLEAN, green PR.** PR #5 sat with auto-merge armed, every check green and `mergeStateStatus: CLEAN` for 5+ min. If that happens, push an empty commit (re-triggers evaluation) or ask the operator; never merge red. |
| 2026-10-16 | **The IP denylist test also scans comments.** A code comment naming a trademarked arcade game failed CI. Describe genres generically (synthwave, arcade racer). |
| 2026-10-16 | **GitHub ignores `merge=union` when computing mergeability.** `.gitattributes` makes local rebases of CHANGELOG/LESSONS conflict-free, but a PR can still show DIRTY on GitHub after another PR lands — and CI's `check` won't even run on a DIRTY PR. If your PR goes DIRTY: `git fetch && git rebase origin/main && git push --force-with-lease`. |
