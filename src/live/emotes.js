// Quick chat for live rooms: a fixed set of kid-safe emotes, never free text.
//
// In a race an emote rides on the state frame the room already relays 10× a second: bits 2–4
// of the frame's flags byte carry the emote (1–7) and bits 5–6 a counter, so sending the same
// emote twice still pops twice. Bits 0–1 stay warp/drift. No server change is needed for that.
// In the lobby and on the results screen there are no frames, so the client also sends
// { t: 'emo', e } — rooms that relay it show it to everyone; older rooms just ignore it.

export const EMOTES = [
  null,
  { e: '👋', label: 'HI!' },
  { e: '🔥', label: 'ON FIRE' },
  { e: '😂', label: 'LOL' },
  { e: '😎', label: 'TOO COOL' },
  { e: '💨', label: 'SEE YA' },
  { e: '👍', label: 'GG' },
  { e: '😱', label: 'WHOA' },
];

export const EMOTE_HOLD_MS = 1200;   // how long the sender keeps the emote in its frames
export const EMOTE_SHOW_MS = 2600;   // how long a bubble stays on a car / row
export const EMOTE_GAP_MS = 1400;    // one emote per this long, so nobody can spam

const MASK = 0b1111100;

/** Flags byte with emote `id` (1–7) and counter `seq` (0–3) packed in; id 0 clears it. */
export function packEmote(flags, id, seq) {
  const base = flags & ~MASK & 0xff;
  if (!id) return base;
  return base | ((id & 7) << 2) | ((seq & 3) << 5);
}

/** { id, key } from a flags byte; key changes every time a new emote is sent. */
export function unpackEmote(flags) {
  const f = flags & 0xff;
  const id = (f >> 2) & 7;
  return { id, key: id ? (f & MASK) : 0 };
}

/**
 * Sender side: rate-limited, held in outgoing frames for EMOTE_HOLD_MS.
 * `now` in ms. Returns the emote id to pack into the next frame (0 when none).
 */
export function createEmoteSender() {
  let id = 0, seq = 0, until = 0, last = -1e9;
  return {
    /** Returns true if the emote was accepted. */
    send(e, now) {
      if (!EMOTES[e] || now - last < EMOTE_GAP_MS) return false;
      last = now;
      id = e;
      seq = (seq + 1) & 3;
      until = now + EMOTE_HOLD_MS;
      return true;
    },
    flags(flags, now) { return now < until ? packEmote(flags, id, seq) : packEmote(flags, 0, 0); },
  };
}

/** Receiver side: one per remote slot; returns the emote id once per new emote, else 0. */
export function createEmoteReader() {
  const lastKey = new Map();
  return {
    read(slot, flags) {
      const { id, key } = unpackEmote(flags);
      const prev = lastKey.get(slot) || 0;
      lastKey.set(slot, key);
      return key && key !== prev ? id : 0;
    },
    reset() { lastKey.clear(); },
  };
}
