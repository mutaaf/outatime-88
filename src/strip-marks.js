// Track strip labels (ticket 0167), so the strip reads without colour. Lives in the lazy
// race-flow chunk, which hands it to the race HUD (src/hud.js, a startup module).

/**
 * For each rival name, the shortest start (one or two letters) no other rival's name shares;
 * still shared (or the same name twice in a live room), the initial and the racer's slot.
 * Labels stay unique and at most two characters (three past nine racers).
 */
export function stripMarks(names) {
  return names.map((n, i) => {
    n = String(n || '?').toUpperCase();
    for (let k = 1; k < 3; k++) {
      const p = n.slice(0, k);
      if (p.length === k && !names.some((m, j) => j !== i && String(m || '?').toUpperCase().startsWith(p))) return p;
    }
    return n[0] + (i + 1);
  });
}
