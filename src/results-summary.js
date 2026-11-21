// The results card's one spoken line (ticket 0294), pure: read once by the card's status region
// as it opens, so a screen-reader player hears how the race went without hunting the card.
import { ordinal, formatRaceTime } from './raceflow.js';

/**
 * `r`: { endless, distance, score, place, total, outcome ('finished' | 'wrecked' | 'timeup'), time }.
 * "FINISHED 2ND OF 6 · TIME 1:42.3", "WRECKED · 5TH OF 6", "RUN OVER · 4,210 M · SCORE 12,345".
 */
export function resultSummary(r) {
  if (r.endless) {
    const dist = r.distance > 0 ? ` · ${Math.round(r.distance).toLocaleString('en-US')} M` : '';
    return `RUN OVER${dist} · SCORE ${Math.max(0, Math.round(r.score || 0)).toLocaleString('en-US')}`;
  }
  const where = r.place > 0 ? `${ordinal(r.place)}${r.total > 0 ? ` OF ${r.total}` : ''}` : '';
  if (r.outcome === 'wrecked') return where ? `WRECKED · ${where}` : 'WRECKED';
  if (r.outcome === 'timeup') return where ? `TIME UP · ${where}` : 'TIME UP';
  const time = r.time != null && Number.isFinite(r.time) ? ` · TIME ${formatRaceTime(r.time)}` : '';
  return `FINISHED${where ? ` ${where}` : ''}${time}`;
}
