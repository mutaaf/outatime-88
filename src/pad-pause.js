// Gamepad pause (0271), pure, race-step chunk only: START (button 9) pauses a race and resumes
// it, and A (button 0) resumes from the pause sheet, through the same path as the Escape key
// (main's toggleGarageModal, Settings' own Escape, the lineup skip on the grid). Only fresh
// presses count: a held button acts once. Outside a race both buttons count as held, so the
// START that started the race from the title (src/home.js) or the A held as gas when the pause
// opened must be let go first. Allocation-free per frame.

const held = { start: false, a: false };
const down = (p, i) => Boolean(p.buttons[i] && p.buttons[i].pressed);

/**
 * START (9) and A (0) on the first connected pad, read straight off the Gamepad API: the race's
 * pad (src/input.js pollGamepad) folds A into the gas with RT. `pads` is navigator.getGamepads().
 * The paired TV phone (`phone` true) has its own PAUSE, so it reads as nothing held. Reuses one object.
 */
export function readPad(pads, phone = false) {
  held.start = held.a = false;
  if (phone || !pads) return held;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected) { held.start = down(p, 9); held.a = down(p, 0); break; }
  }
  return held;
}

/** The press memory: `start` / `a` = held last frame; the edges are set by padEdges. */
export function createPadMenu() {
  return { start: true, a: true, startEdge: false, aEdge: false };
}

/**
 * Fresh presses of START and A: `mem.startEdge` / `mem.aEdge` are true only on the call a
 * button goes down. No pad never fires. Returns `mem`.
 */
export function padEdges(gp, mem) {
  const start = Boolean(gp && gp.start), a = Boolean(gp && gp.a);
  mem.startEdge = start && !mem.start;
  mem.aEdge = a && !mem.a;
  mem.start = start;
  mem.a = a;
  return mem;
}

/**
 * One frame. `status` is GameState.status, `poll()` the pad (only read in a race), `escape()`
 * presses Escape. START toggles in any race (a live race can't pause: Escape opens and closes
 * the sheet over it, as on the keyboard); A only resumes a paused race. True when it pressed.
 */
export function padPauseStep(status, poll, mem, escape) {
  if (status !== 'PLAYING' && status !== 'PAUSED') { mem.start = mem.a = true; mem.startEdge = mem.aEdge = false; return false; }
  padEdges(poll(), mem);
  if (!mem.startEdge && !(mem.aEdge && status === 'PAUSED')) return false;
  escape();
  return true;
}
