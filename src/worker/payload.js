// Versioned run payloads (ticket 0051). Every submit says which payload version it is (`v`,
// default 1) so scoring rules can change without breaking old clients or old rows:
//   v1  { score, distance, durationMs, warps, level, mode }           (the 0024 shape)
//   v2  v1 + { car, cls, breakdown: { part: int, ... } }  the parts must sum to `score`,
//       e.g. { distance, combos, takedowns, wallScrapes: -400, offTrack: -1200 }
// A feature that changes scoring adds a version here (and may recompute the score from the
// breakdown or a run log) rather than loosening an existing one. Boards can be split by car
// class (`cls`, one letter) so different cars race fairly.

export const PAYLOAD_VERSIONS = [1, 2];
const CAR_RE = /^[A-Z0-9_]{1,24}$/;
const CLS_RE = /^[A-Z]$/;
const PART_RE = /^[a-z][a-zA-Z0-9]{0,23}$/;
const MAX_PARTS = 16;

/** → { pv, car, cls } or { error } */
export function readPayload(body) {
  const pv = body.v === undefined ? 1 : body.v;
  if (!PAYLOAD_VERSIONS.includes(pv)) return { error: 'unknown payload version' };
  const car = typeof body.car === 'string' && CAR_RE.test(body.car) ? body.car : '';
  const cls = typeof body.cls === 'string' && CLS_RE.test(body.cls) ? body.cls : '';
  if (pv >= 2) {
    const b = body.breakdown;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'v2 needs a score breakdown' };
    const parts = Object.entries(b);
    if (!parts.length || parts.length > MAX_PARTS) return { error: 'bad breakdown' };
    let sum = 0;
    for (const [k, n] of parts) {
      if (!PART_RE.test(k) || !Number.isInteger(n) || Math.abs(n) > 1e9) return { error: 'bad breakdown' };
      sum += n;
    }
    if (sum !== body.score) return { error: 'breakdown does not add up to the score' };
    if (!car) return { error: 'v2 needs a car' };
  }
  return { pv, car, cls };
}
