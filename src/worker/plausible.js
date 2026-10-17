// Server-side plausibility (ticket 0024). Generous on purpose — the goal is to stop forged
// and impossible scores, not to second-guess great runs. Calibrated against the campaign
// ladder (src/progress.js: level-1 gold ≈ 2.5M in a ~1-minute run ≈ 40k pts/s).

import { penaltyMismatch } from '../scoring.js';

export const LIMITS = {
  minDurationMs: 4000,          // a run shorter than this can't have scored anything real
  maxDurationMs: 2 * 3600e3,    // tokens expire after two hours
  clockSlackMs: 5000,           // network + timer skew between client and server
  maxPointsPerSec: 150000,      // ~4x the best measured scoring rate
  // Distance accrues at the car's mph per second; warp tops ~160 and endless waves add
  // more, so ~2x the highest sustained speed seen (measured 2026-10-17: ~90/s average).
  maxMetersPerSec: 300,
  maxScore: 250_000_000,
  maxWarps: 500,
};

/**
 * @param run {score, distance, durationMs, warps}
 * @param tokenAgeMs server-measured time since the run token was issued
 * @returns null if plausible, otherwise a short reason
 */
export function implausible(run, tokenAgeMs) {
  const { score, distance, durationMs, warps } = run;
  const ints = [score, distance, durationMs, warps];
  if (!ints.every((n) => Number.isInteger(n) && n >= 0)) return 'bad numbers';
  if (tokenAgeMs > LIMITS.maxDurationMs) return 'token expired';
  if (durationMs < LIMITS.minDurationMs) return 'run too short';
  if (durationMs > tokenAgeMs + LIMITS.clockSlackMs) return 'run longer than its token';
  const secs = Math.min(durationMs, tokenAgeMs + LIMITS.clockSlackMs) / 1000;
  // Penalty scoring (ticket 0073): the score must equal earned − the penalty recomputed from
  // the run log; the rate limits apply to what was earned before penalties.
  const mismatch = penaltyMismatch(run);
  if (mismatch) return mismatch;
  const earned = Number.isInteger(run.earned) ? run.earned : score;
  if (score > LIMITS.maxScore || earned > LIMITS.maxScore) return 'score over cap';
  if (earned > LIMITS.maxPointsPerSec * secs + 50000) return 'score too fast';
  if (distance > LIMITS.maxMetersPerSec * secs + 200) return 'distance too fast';
  if (warps > LIMITS.maxWarps) return 'too many warps';
  return null;
}
