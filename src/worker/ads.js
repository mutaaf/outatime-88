// Sponsor-board impressions (ticket 0140, docs/ADS.md). The game posts aggregate counts per
// campaign per UTC day: { v: 1, day, counts: { campaignId: n } }. Nothing identifying is sent
// or stored; the address is only used, hourly-salted, to rate-limit, like code redemption.
//
//   POST /outatime/api/ads/impressions   add a batch → 204
//   GET  /outatime/api/ads/impressions?day=YYYY-MM-DD   that day's totals (for invoicing)
//
// Only campaigns listed in the game's own /outatime/ads/manifest.json are counted, so random
// ids can't fill the table; counts per batch are capped and batches are rate-limited.
import { json, utcDay } from './scores.js';
import { throttleKey, throttled } from './identity.js';

export const ADS = { maxBody: 2048, maxCampaigns: 24, maxCount: 200, windowMs: 15 * 60e3, maxBatches: 30, manifestTtlMs: 5 * 60e3 };
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

let known = null, knownAt = -Infinity;
/** Campaign ids in the deployed manifest (cached per isolate for a few minutes). */
async function campaigns(assets, now) {
  if (known && now - knownAt < ADS.manifestTtlMs) return known;
  const ids = new Set();
  try {
    const res = assets ? await assets.fetch('https://assets.local/outatime/ads/manifest.json') : null;
    const m = res && res.ok ? await res.json() : null;
    if (m && Array.isArray(m.campaigns)) for (const c of m.campaigns) if (c && c.kidSafe === true && ID.test(String(c.id))) ids.add(c.id);
  } catch { /* no manifest: nothing is counted */ }
  known = ids; knownAt = now;
  return ids;
}
export function resetAdsCache() { known = null; knownAt = -Infinity; }

/** A valid batch as [[campaign, n], …], or an error string. */
export function readBatch(body, ids, today, yesterday) {
  if (!body || typeof body !== 'object' || body.v !== 1) return 'bad batch';
  if (!DAY.test(String(body.day)) || (body.day !== today && body.day !== yesterday)) return 'bad day';
  if (!body.counts || typeof body.counts !== 'object' || Array.isArray(body.counts)) return 'bad counts';
  const out = [];
  for (const [id, n] of Object.entries(body.counts)) {
    if (!ID.test(id) || !Number.isInteger(n) || n < 1 || n > ADS.maxCount) return 'bad count';
    if (ids.has(id)) out.push([id, n]);
    if (out.length > ADS.maxCampaigns) return 'too many campaigns';
  }
  return out;
}

export async function handleAds(request, url, { db, now, ip, assets, secret }) {
  const t = now();
  if (request.method === 'GET') {
    const day = url.searchParams.get('day') || utcDay(t);
    if (!DAY.test(day)) return json(400, { error: 'bad day' });
    const { results } = await db.prepare('SELECT campaign, n FROM ad_impressions WHERE day = ? ORDER BY campaign').bind(day).all();
    const counts = {};
    for (const r of results) counts[r.campaign] = r.n;
    return json(200, { day, counts });
  }
  if (request.method !== 'POST') return json(405, { error: 'method' });
  if ((request.headers.get('content-length') | 0) > ADS.maxBody) return json(413, { error: 'too large' });
  const text = await request.text();
  if (text.length > ADS.maxBody) return json(413, { error: 'too large' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'bad json' }); }
  const batch = readBatch(body, await campaigns(assets, t), utcDay(t), utcDay(t - 86400e3));
  if (typeof batch === 'string') return json(400, { error: batch });
  if (await throttled(db, await throttleKey('ads', ip || 'unknown', await secret(), t), ADS.maxBatches, t)) return json(429, { error: 'slow down' });
  for (const [id, n] of batch) {
    await db.prepare('INSERT INTO ad_impressions (day, campaign, n) VALUES (?, ?, ?) ON CONFLICT (day, campaign) DO UPDATE SET n = n + excluded.n')
      .bind(body.day, id, n).run();
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
