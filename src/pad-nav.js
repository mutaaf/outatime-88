// Gamepad menu navigation (0273), pure, home chunk only (src/home.js): while a scoped menu
// (src/focus-scope.js) is open and no race is driving, D-pad / left stick move focus like Tab and
// Shift+Tab, A presses the focused control and B is the menu's own close. Only fresh presses
// count; a held direction repeats after NAV.first ms, then every NAV.repeat ms. Allocation-free.

export const NAV = { dead: 0.6, first: 350, repeat: 120 };

/** The press memory. Everything starts as held, so a button carried into a menu must be let go first. */
export function createNav() {
  return { dir: null, t: 0, rep: false, a: true, b: true };
}

/** Forget the pad: the next frame must see a button go down before it counts. */
export function resetNav(st) {
  st.dir = null; st.t = 0; st.rep = false; st.a = st.b = true;
  return st;
}

const pressed = (p, i) => Boolean(p.buttons[i] && p.buttons[i].pressed);
const cur = { dir: 0, a: false, b: false };

/**
 * What every connected pad holds, folded into one reused `{ dir, a, b }`: dir -1 = up/left
 * (previous), 1 = down/right (next), 0 = none. D-pad buttons 12-15 or the left stick past NAV.dead
 * (the larger axis wins).
 */
export function readNav(pads) {
  cur.dir = 0; cur.a = cur.b = false;
  if (!pads) return cur;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (!p || !p.connected) continue;
    cur.a = cur.a || pressed(p, 0);
    cur.b = cur.b || pressed(p, 1);
    if (cur.dir) continue;
    if (pressed(p, 12) || pressed(p, 14)) cur.dir = -1;
    else if (pressed(p, 13) || pressed(p, 15)) cur.dir = 1;
    else {
      const x = p.axes[0] || 0, y = p.axes[1] || 0;
      const v = Math.abs(x) > Math.abs(y) ? x : y;
      if (Math.abs(v) >= NAV.dead) cur.dir = v < 0 ? -1 : 1;
    }
  }
  return cur;
}

/**
 * One frame: `pad` is `{ dir, a, b }` (readNav), `dtMs` the time since the last frame, `st` the
 * memory (createNav). Returns 'select' (A went down), 'back' (B went down), 'next' / 'prev' (a
 * fresh direction, or a held one repeating) or null. At most one action a frame; A wins over B,
 * buttons over directions.
 */
export function padMenuStep(pad, dtMs, st) {
  const aEdge = pad.a && !st.a, bEdge = pad.b && !st.b;
  st.a = pad.a; st.b = pad.b;
  let move = null;
  if (st.dir === null) {
    // A direction already held as the menu opened never moves or repeats: wait for a change.
    st.dir = pad.dir; st.rep = false; st.t = pad.dir ? -Infinity : 0;
  } else if (pad.dir !== st.dir) {
    st.dir = pad.dir; st.t = 0; st.rep = false;
    if (pad.dir) move = pad.dir > 0 ? 'next' : 'prev';
  } else if (pad.dir) {
    st.t += dtMs;
    const wait = st.rep ? NAV.repeat : NAV.first;
    if (st.t >= wait) { st.t -= wait; st.rep = true; move = pad.dir > 0 ? 'next' : 'prev'; }
  }
  if (aEdge) return 'select';
  if (bEdge) return 'back';
  return move;
}
