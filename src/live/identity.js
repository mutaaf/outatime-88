// Who you are in a room (0060 on top of 0090). Rooms seat you by your racer: the Worker reads
// the identity cookie on the WebSocket upgrade, so a reload, a second tab or a dropped
// connection slides the same racer back into the same seat. The credential itself never goes
// into a room message (AGENTS.md § Privacy model) — only public ids come back out.
//
// Fallback when there's no racer (cookies blocked, identity offline): the room's own seat
// id + key, kept per tab in sessionStorage. Never derived from IP or device fingerprints.

import { profile, setProfile, addFriends, publicId } from '../identity.js';

const KEY = 'outatime_live_seat_v1';

function read() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function loadSeat(code) {
  const all = read();
  return all[code] || null;
}

export function saveSeat(code, seat) {
  try {
    const all = read();
    all[code] = { id: seat.id, key: seat.key };
    for (const k of Object.keys(all).slice(0, -4)) delete all[k]; // keep the last few rooms
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private mode: reconnects just get a fresh seat */ }
}

/** Your racer's initials, if your racer has picked some. */
export const racerInitials = () => (profile() && profile().initials) || '';

/** Lobby edits follow the racer, so the next room (and the leaderboard) already knows you. */
export function saveRacerInitials(initials) {
  if (publicId()) setProfile({ initials });
}

/** After a race, the humans you raced become friends (public ids only). */
export function rememberRivals(pubs) {
  const mine = publicId();
  const others = pubs.filter((p) => p && p !== mine);
  if (mine && others.length) addFriends(others);
}
