// One local save per racer on a shared device (ticket 0090). The live save stays under the
// main key (AGENTS.md invariant 6, never renamed); racers who aren't playing right now are
// parked under a separate versioned key, so siblings on one iPad each keep their own coins,
// garage and medals. Only the RACER panel's chunk uses this module; merging server bests is
// src/progress.js mergeServerBests (0223).

export const SAVES_KEY = 'outatime88_racer_saves_v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(SAVES_KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(SAVES_KEY, JSON.stringify(all)); } catch { /* storage full */ }
}

/** Park `fromPub`'s live save and load `toPub`'s (or a fresh one) into SaveStore. */
export function swapSave(store, fromPub, toPub, fresh) {
  const all = readAll();
  if (fromPub) all[fromPub] = JSON.parse(JSON.stringify(store.data));
  const next = toPub && all[toPub] ? all[toPub] : fresh();
  if (toPub) delete all[toPub];
  writeAll(all);
  store.data = Object.assign(fresh(), next);
  store.save();
  // Re-run the store's own load so every normaliser (settings, garage, career…) fills the
  // swapped-in save before anything draws with it — the title keeps rendering until reload.
  store.load?.();
}

export function dropSave(pub) {
  const all = readAll();
  delete all[pub];
  writeAll(all);
}
