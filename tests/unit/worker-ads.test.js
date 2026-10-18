// Sponsor-board impressions endpoint (ticket 0140): aggregate counts only, manifest-checked,
// capped and rate-limited.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleApi, resetSchemaCache } from '../../src/worker/scores.js';
import { ADS, readBatch, resetAdsCache } from '../../src/worker/ads.js';
import { fakeD1 } from './fake-d1.js';

const NOW = Date.UTC(2026, 9, 18, 15, 0, 0);
const TODAY = '2026-10-18';
const manifest = { v: 1, campaigns: [{ id: 'house-daily', kidSafe: true }, { id: 'acme', kidSafe: true }, { id: 'unsafe', kidSafe: false }] };
const assets = { fetch: async () => new Response(JSON.stringify(manifest), { status: 200 }) };
const URL_ = 'https://mutaafaziz.com/outatime/api/ads/impressions';

function post(db, body, ip = '1.2.3.4') {
  return handleApi(new Request(URL_, { method: 'POST', body: JSON.stringify(body) }), { db, now: () => NOW, ip, assets });
}
const get = (db, day = TODAY) => handleApi(new Request(`${URL_}?day=${day}`), { db, now: () => NOW, ip: '', assets }).then((r) => r.json());

describe('ad impressions endpoint', () => {
  let db;
  beforeEach(() => { resetSchemaCache(); resetAdsCache(); db = fakeD1(); });

  it('adds batches into per-day, per-campaign totals and stores nothing else', async () => {
    expect((await post(db, { v: 1, day: TODAY, counts: { 'house-daily': 3, acme: 1 } })).status).toBe(204);
    expect((await post(db, { v: 1, day: TODAY, counts: { acme: 2 } }, '5.6.7.8')).status).toBe(204);
    expect(await get(db)).toEqual({ day: TODAY, counts: { acme: 3, 'house-daily': 3 } });
    const cols = (await db.prepare('PRAGMA table_info(ad_impressions)').all()).results.map((c) => c.name);
    expect(cols).toEqual(['day', 'campaign', 'n']);
  });

  it('ignores campaigns not in the manifest (or not kid-safe) and rejects malformed batches', async () => {
    expect((await post(db, { v: 1, day: TODAY, counts: { random: 5, unsafe: 5, acme: 1 } })).status).toBe(204);
    expect((await get(db)).counts).toEqual({ acme: 1 });
    for (const bad of [
      { v: 2, day: TODAY, counts: {} },
      { v: 1, day: '2026-10-10', counts: { acme: 1 } },      // too old
      { v: 1, day: TODAY, counts: { acme: 0 } },
      { v: 1, day: TODAY, counts: { acme: ADS.maxCount + 1 } },
      { v: 1, day: TODAY, counts: { acme: 1.5 } },
      { v: 1, day: TODAY, counts: { 'Bad Id': 1 } },
      { v: 1, day: TODAY, counts: [] },
    ]) expect((await post(db, bad)).status, JSON.stringify(bad)).toBe(400);
  });

  it('accepts yesterday (a batch sent just after midnight)', () => {
    expect(readBatch({ v: 1, day: '2026-10-17', counts: { acme: 1 } }, new Set(['acme']), TODAY, '2026-10-17')).toEqual([['acme', 1]]);
  });

  it('rate-limits batches per (hourly-salted) address', async () => {
    let last = 0;
    for (let i = 0; i <= ADS.maxBatches; i++) last = (await post(db, { v: 1, day: TODAY, counts: { acme: 1 } })).status;
    expect(last).toBe(429);
    expect((await get(db)).counts.acme).toBe(ADS.maxBatches);
  });

  it('counts nothing when the manifest is missing', async () => {
    const r = await handleApi(new Request(URL_, { method: 'POST', body: JSON.stringify({ v: 1, day: TODAY, counts: { acme: 1 } }) }),
      { db, now: () => NOW, ip: '1.1.1.1', assets: { fetch: async () => new Response('nope', { status: 404 }) } });
    expect(r.status).toBe(204);
    expect((await get(db)).counts).toEqual({});
  });
});
