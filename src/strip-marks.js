// Track strip labels (ticket 0167), so the strip reads without colour. Lives in the lazy
// race-flow chunk, which hands it to the race HUD (src/hud.js, a startup module).

/**
 * For each rival name, the shortest start (one or two letters) no other rival's name shares;
 * still shared (or the same name twice in a live room), the initial and a count among the
 * racers sharing it (T1, T2: never a place number). Labels stay unique and at most two characters.
 */
export function stripMarks(names) {
  return names.map((n, i) => {
    n = String(n || '?').toUpperCase();
    for (let k = 1; k < 3; k++) {
      const p = n.slice(0, k);
      if (p.length === k && !names.some((m, j) => j !== i && String(m || '?').toUpperCase().startsWith(p))) return p;
    }
    const c = n[0];
    return c + (names.slice(0, i).filter((m) => String(m || '?').toUpperCase()[0] === c).length + 1);
  });
}

/**
 * Ticket 0209: spread a pack of strip markers sideways so no two cover each other. `x` holds
 * each marker's wanted centre and `w` its width (px, leader first, YOU at `you`). YOU never
 * moves; the cars ahead of you push right and the cars behind push left, so the race order
 * still reads left to right, and every box stays inside [lo, hi] (a pack against an end packs
 * back towards you; with no room left it stays on your side of YOU, under it). A marker clear of its neighbours keeps its exact spot. Writes `out`.
 */
export function fanOut(x, w, n, you, lo, hi, gap, out) {
  if (!(you >= 0 && you < n)) you = 0;
  out[you] = x[you];
  let edge = x[you] + w[you] / 2;
  for (let i = you - 1; i >= 0; i--) { out[i] = Math.max(x[i], edge + gap + w[i] / 2); edge = out[i] + w[i] / 2; }
  edge = hi;
  for (let i = 0; i < you; i++) { out[i] = Math.max(x[you], Math.min(out[i], edge - w[i] / 2)); edge = out[i] - w[i] / 2 - gap; }
  edge = x[you] - w[you] / 2;
  for (let i = you + 1; i < n; i++) { out[i] = Math.min(x[i], edge - gap - w[i] / 2); edge = out[i] - w[i] / 2; }
  edge = lo;
  for (let i = n - 1; i > you; i--) { out[i] = Math.min(x[you], Math.max(out[i], edge + w[i] / 2)); edge = out[i] + w[i] / 2 + gap; }
  return out;
}

/**
 * The race HUD's marker placer (src/hud.js calls it after every update with the standings and
 * its dots, each carrying `frac`, its exact share of the strip). Sizes come from a
 * ResizeObserver, so the HUD still never reads layout; until they arrive (or with no strip on
 * screen) markers sit at their exact spots. Writes `left` only when it changes.
 */
const DEADBAND = 2; // metres

export function createStripFan(gap = 2) {
  const size = new WeakMap(); // node -> border-box width
  const x = [], w = [], out = [];
  let ro = null, layer = null, dotsW = 0, trackW = 0;
  function observe(field, dots) {
    if (!ro) {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const b = e.borderBoxSize && e.borderBoxSize[0];
          const bw = b ? b.inlineSize : e.contentRect.width;
          if (e.target === layer) dotsW = e.contentRect.width;
          else if (e.target === layer.parentNode) trackW = e.contentRect.width;
          else size.set(e.target, bw);
        }
      });
    }
    ro.disconnect(); // a new field (race start, a live room changing): watch only today's markers
    ro.observe(layer);
    if (layer.parentNode) ro.observe(layer.parentNode);
    for (const e of field) {
      const d = dots.get(e.id);
      if (d) { size.set(d.node, 0); ro.observe(d.node); }
    }
  }
  const ents = [], ord = [];
  return function place(field, dots, el) {
    let m = 0, me = -1, fresh = false;
    for (const e of field) {
      const d = dots.get(e.id);
      if (!d) continue;
      if (!size.has(d.node)) fresh = true;
      if (e.isPlayer) me = m;
      ents[m] = e;
      m++;
    }
    if (el && (fresh || el !== layer) && typeof ResizeObserver === 'function') { layer = el; observe(field, dots); }
    // Which side of YOU each rival fans to. A car level with you keeps its side until it is
    // DEADBAND metres past you, so a side-by-side duel doesn't throw its marker across the YOU tag
    // on every swap. Order: the cars ahead (standings order), YOU, the cars behind.
    let n = 0, you = -1;
    const pYou = me >= 0 ? ents[me].progress : 0;
    for (let pass = 1; pass >= -1; pass--) {
      for (let i = 0; i < m; i++) {
        const d = dots.get(ents[i].id);
        let side = 0;
        if (i !== me) {
          side = me < 0 || i < me ? 1 : -1;
          if (d.side && me >= 0 && Math.abs(ents[i].progress - pYou) < DEADBAND) side = d.side;
          d.side = side;
        }
        if (side !== pass) continue;
        if (side === 0) you = n;
        ord[n] = d;
        x[n] = d.frac * dotsW;
        w[n] = size.get(d.node) || 0;
        n++;
      }
    }
    // The layer is inset in the track by half the YOU tag (0167): a box may use that margin.
    const inset = Math.max(0, (trackW - dotsW) / 2);
    if (dotsW > 0) fanOut(x, w, n, you, -inset, dotsW + inset, gap, out);
    for (let k = 0; k < n; k++) {
      const d = ord[k];
      const left = Math.round((dotsW > 0 ? out[k] / dotsW : d.frac) * 1000) / 10;
      if (left !== d.left) { d.left = left; d.node.style.left = `${left}%`; }
    }
  };
}
