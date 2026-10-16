# Lessons

Mistakes already paid for. Read before working; append a row when you learn one (newest last).

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-16 | Lint for `no-undef` after every carve | Porting the single file into ES modules surfaced `obsSpacing` referenced in an `if (false)` block; sloppy-mode inline scripts hid it. `npm run lint` now catches any identifier left behind when moving code between modules. |
| 2026-10-16 | Module bindings are read-only | Imported names (`GameState`, `InputState`, data tables) can be mutated property-by-property but never reassigned. Keep shared state as objects; never `GameState = {...}`. |
| 2026-10-16 | Base path everywhere | The app lives at `/outatime/`. A root-absolute URL works in `npm run dev` habits but 404s in production; use imports or `import.meta.env.BASE_URL`. |
