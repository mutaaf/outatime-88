// Ghost trace codec (ticket 0052), shared by the game and the Worker. A ghost is the car's
// distance and lane sampled at a fixed rate: per sample a uint16 distance delta (in 1/20 of
// a distance unit) and an int8 lane (playerX / 0.72 × 127), base64url-encoded. A 140 s race
// at 5 Hz is ~2.8 kB of text.

export const GHOST = { hz: 5, version: 1, maxSamples: 1500, maxChars: 6200, distScale: 20, maxX: 0.72 };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (left > 1) out += B64[(n >> 6) & 63];
    if (left > 2) out += B64[n & 63];
  }
  return out;
}

function fromB64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : 0));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out;
}

/** samples: [{ d: distance, x: playerX }] in time order → string */
export function encodeGhost(samples) {
  const n = Math.min(samples.length, GHOST.maxSamples);
  const bytes = new Uint8Array(2 + n * 3);
  bytes[0] = GHOST.version;
  bytes[1] = GHOST.hz;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const q = Math.round(Math.max(prev, samples[i].d * GHOST.distScale));
    const delta = Math.min(65535, q - prev);
    prev += delta;
    const x = Math.max(-127, Math.min(127, Math.round((samples[i].x / GHOST.maxX) * 127)));
    bytes[2 + i * 3] = delta >> 8;
    bytes[3 + i * 3] = delta & 255;
    bytes[4 + i * 3] = x & 255;
  }
  return toB64(bytes);
}

/** string → { hz, d: Float64Array, x: Float32Array } or null if malformed */
export function decodeGhost(text) {
  if (typeof text !== 'string' || text.length > GHOST.maxChars) return null;
  const bytes = fromB64(text);
  if (!bytes || bytes.length < 2 || bytes[0] !== GHOST.version || bytes[1] !== GHOST.hz) return null;
  if ((bytes.length - 2) % 3 !== 0) return null;
  const n = (bytes.length - 2) / 3;
  if (n > GHOST.maxSamples) return null;
  const d = new Float64Array(n);
  const x = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (bytes[2 + i * 3] << 8) | bytes[3 + i * 3];
    d[i] = acc / GHOST.distScale;
    const xb = bytes[4 + i * 3];
    x[i] = ((xb > 127 ? xb - 256 : xb) / 127) * GHOST.maxX;
  }
  return { hz: bytes[1], d, x };
}

/** Distance and lane t seconds into the ghost's run. Sample i was taken at (i + 1) / hz, from
 * distance 0; between samples it interpolates linearly, and after the last it holds. */
export function ghostAt(ghost, t) {
  const n = ghost.d.length;
  if (!n) return { d: 0, x: 0, done: true };
  const pos = Math.max(0, t * ghost.hz);
  const i = Math.floor(pos);
  if (i >= n) return { d: ghost.d[n - 1], x: ghost.x[n - 1], done: true };
  const k = pos - i;
  const d0 = i === 0 ? 0 : ghost.d[i - 1];
  const x0 = i === 0 ? ghost.x[0] : ghost.x[i - 1];
  return { d: d0 + (ghost.d[i] - d0) * k, x: x0 + (ghost.x[i] - x0) * k, done: false };
}
