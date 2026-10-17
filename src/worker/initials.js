// Arcade initials (ticket 0024): exactly three letters A–Z, nothing personal, nothing rude.
// The blocklist covers common slurs/obscenities in three letters; it is deliberately small
// and conservative — anything on it is rejected, the player just picks other letters.

const BLOCKED = new Set([
  'ASS', 'AZZ', 'BCH', 'CNT', 'COC', 'COK', 'CUK', 'CUM', 'DIC', 'DIK', 'DYK', 'FAG', 'FCK',
  'FKU', 'FUC', 'FUK', 'FUQ', 'FUX', 'HOR', 'HTL', 'JIZ', 'KKK', 'KUM', 'KYS', 'NAZ', 'NGR',
  'NIG', 'PIS', 'PNS', 'PUS', 'RPE', 'SEX', 'SHT', 'SLT', 'SPK', 'SUK', 'TIT', 'TWT', 'VAG',
  'WOP', 'XXX',
]);

export const INITIALS_RE = /^[A-Z]{3}$/;

/** Normalises user input to the canonical form, or returns null if it can't be accepted. */
export function cleanInitials(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (!INITIALS_RE.test(s)) return null;
  if (BLOCKED.has(s)) return null;
  return s;
}
