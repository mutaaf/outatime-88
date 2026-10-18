// Your last crew (this device only): the room code, who was in it and when, so the friends
// menu can offer "RACE AGAIN" with one tap. Initials only — the same 3 letters every racer in
// the room already sees — and nothing leaves the device. Rooms close 10 minutes after the
// last racer leaves (LIVE.idleMs), so an old code is retried once and then replaced.

const KEY = 'outatime_live_crew_v1';
export const CREW_FRESH_MS = 9 * 60e3;   // just under the room's idle wipe
export const CREW_KEEP_MS = 7 * 24 * 3600e3;

export function loadCrew(now = Date.now(), store = globalThis.localStorage) {
  try {
    const c = JSON.parse(store.getItem(KEY) || 'null');
    if (!c || typeof c.code !== 'string' || !Array.isArray(c.names) || !(now - c.at < CREW_KEEP_MS)) return null;
    return { code: c.code, at: c.at, names: c.names.filter((n) => typeof n === 'string').slice(0, 5), races: c.races | 0, fresh: now - c.at < CREW_FRESH_MS };
  } catch { return null; }
}

/** Remember the room you're in and the other humans in it (call on every room snapshot). */
export function saveCrew(room, me, now = Date.now(), store = globalThis.localStorage) {
  if (!room || room.public) return;
  const names = room.players.filter((p) => p.id !== me).map((p) => p.name);
  try {
    const prev = loadCrew(now, store);
    const keep = prev && prev.code === room.code && !names.length ? prev.names : names;
    store.setItem(KEY, JSON.stringify({ code: room.code, at: now, names: keep.slice(0, 5), races: room.race | 0 }));
  } catch { /* private mode */ }
}

export function forgetCrew(store = globalThis.localStorage) {
  try { store.removeItem(KEY); } catch { /* private mode */ }
}

/** "SKY, RAD & ZAP" */
export function crewLabel(names) {
  if (!names.length) return 'just you';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
