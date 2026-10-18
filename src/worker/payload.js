// Versioned run payloads (ticket 0091). Each stored run records which payload shape it came
// from (`pv`), so boards and checks can tell old rules from new ones:
//   v1  { score, distance, durationMs, warps, level, mode }        (the 0024 shape)
//   v2  v1 + { earned, pen }  the score is recomputed from the penalty log (0073, plausible.js)
//   v3  v2 with pen.{wallN, wallBill}: wall scrapes cost a capped amount per contact (0165)
// Optional on any version: `car` (roster id) and `cls` (one-letter car class) so boards can
// be split by class and different cars race fairly. A future scoring change adds v3 here
// rather than loosening an existing version.

export const PAYLOAD_VERSIONS = [1, 2, 3];
const CAR_RE = /^[A-Z0-9_]{1,24}$/;
const CLS_RE = /^[A-Z]$/;

/** → { pv, car, cls } or { error } */
export function readPayload(body) {
  const pen = body.pen;
  const pv = body.v === undefined ? (pen !== undefined ? (pen && pen.wallN !== undefined ? 3 : 2) : 1) : body.v;
  if (!PAYLOAD_VERSIONS.includes(pv)) return { error: 'unknown payload version' };
  if (pv >= 2 && pen === undefined) return { error: `v${pv} needs a penalty log` };
  if (pv === 3 && !(pen && pen.wallN !== undefined)) return { error: 'v3 needs wall contacts' };
  if (pv === 2 && pen && pen.wallN !== undefined) return { error: 'v2 has no wall contacts' };
  const car = typeof body.car === 'string' && CAR_RE.test(body.car) ? body.car : '';
  const cls = typeof body.cls === 'string' && CLS_RE.test(body.cls) ? body.cls : '';
  return { pv, car, cls };
}
