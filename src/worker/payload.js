// Versioned run payloads (ticket 0091). Each stored run records which payload shape it came
// from (`pv`), so boards and checks can tell old rules from new ones:
//   v1  { score, distance, durationMs, warps, level, mode }        (the 0024 shape)
//   v2  v1 + { earned, pen }  the score is recomputed from the penalty log (0073, plausible.js)
// Optional on any version: `car` (roster id) and `cls` (one-letter car class) so boards can
// be split by class and different cars race fairly. A future scoring change adds v3 here
// rather than loosening an existing version.

export const PAYLOAD_VERSIONS = [1, 2];
const CAR_RE = /^[A-Z0-9_]{1,24}$/;
const CLS_RE = /^[A-Z]$/;

/** → { pv, car, cls } or { error } */
export function readPayload(body) {
  const pv = body.v === undefined ? (body.pen !== undefined ? 2 : 1) : body.v;
  if (!PAYLOAD_VERSIONS.includes(pv)) return { error: 'unknown payload version' };
  if (pv === 2 && body.pen === undefined) return { error: 'v2 needs a penalty log' };
  const car = typeof body.car === 'string' && CAR_RE.test(body.car) ? body.car : '';
  const cls = typeof body.cls === 'string' && CLS_RE.test(body.cls) ? body.cls : '';
  return { pv, car, cls };
}
