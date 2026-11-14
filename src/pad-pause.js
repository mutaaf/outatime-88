// Gamepad pause (0271), race-late chunk only (src/race-late.js): START (button 9) pauses a race and resumes
// it, and A (button 0) resumes from the pause sheet. padFrame (below) turns a press into the
// keyboard's Escape path (main's toggleGarageModal, Settings' own Escape). Only fresh
// presses count: a held button acts once. Outside a race both buttons count as held, so the
// START that started the race from the title (src/home.js) or the A held as gas when the pause
// opened must be let go first. Allocation-free per frame.

const held = { start: false, a: false };
const down = (p, i) => Boolean(p.buttons[i] && p.buttons[i].pressed);

/**
 * START (9) and A (0) held on any connected pad (like src/home.js), read straight off the Gamepad
 * API: the race's pad (src/input.js pollGamepad) folds A into the gas with RT. `pads` is
 * navigator.getGamepads(). The paired TV phone (`phone` true) has its own PAUSE, so it reads as
 * nothing held. Reuses one object.
 */
export function readPad(pads, phone = false) {
  held.start = held.a = false;
  if (phone || !pads) return held;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected) { held.start = held.start || down(p, 9); held.a = held.a || down(p, 0); }
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
 * One frame. `status` is GameState.status, `poll()` the pad (only read in a race), `act(start)`
 * does the press (true = START, false = A). START acts in any race (a live race can't pause: it
 * opens and closes the sheet over it, as Escape does); A only while paused. True when it acted.
 */
export function padPauseStep(status, poll, mem, act) {
  if (status !== 'PLAYING' && status !== 'PAUSED') { mem.start = mem.a = true; mem.startEdge = mem.aEdge = false; return false; }
  padEdges(poll(), mem);
  if (!mem.startEdge && !(mem.aEdge && status === 'PAUSED')) return false;
  act(mem.startEdge);
  return true;
}

// The DOM side: race-step.js padPause() calls padFrame once a frame (main's loop), paused or
// not. A press is normally a real Escape keydown on the focused element, so it takes the keyboard's path (pause sheet, Settings, a live race's sheet). Over a new-car
// reveal START is LATER and A is DRIVE; in any other dialog (the racer panel over Settings) the
// pad leaves it alone; paused with no sheet up (one still loading, a TV pause) it just resumes.
const padMenu = createPadMenu();
const pressEscape = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
const shownEl = (id) => { const e = document.getElementById(id); return Boolean(e && !e.classList.contains('hidden')); };
function padAct(start, GameState, InputState) {
  const a = document.activeElement || document.body;
  const d = a.closest && a.closest('[role="dialog"]');
  if (shownEl('carRevealOverlay')) {
    if (start) pressEscape(a);
    else document.getElementById('btnRevealDrive').click();
  } else if (d && d.getClientRects().length && d.id !== 'garageModal' && d.id !== 'settingsModal' && d.id !== 'titleScreen') return;
  else if (GameState.status === 'PAUSED' && !shownEl('garageModal') && !shownEl('settingsModal')) GameState.status = 'PLAYING';
  else pressEscape(a);
  // The synthetic key told src/racestage.js the keyboard is in hand: the pad is (0007).
  InputState.lastInput = 'pad';
  document.body.classList.add('input-pad');
}
let gs = null, ins = null;
const padRead = () => {
  let pads = null;
  try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) {}
  return readPad(pads, ins.lastInput === 'phone'); // the paired TV phone has its own PAUSE
};
const act = (start) => padAct(start, gs, ins);
/** One frame: `GameState` and `InputState` from main (this chunk imports nothing from it). Allocation-free. */
export function padFrame(GameState, InputState) {
  gs = GameState; ins = InputState;
  padPauseStep(GameState.status, padRead, padMenu, act);
}
