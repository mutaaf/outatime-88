import { describe, it, expect, beforeEach } from 'vitest';
import { cleanInitials } from '../../src/worker/initials.js';
import { implausible, LIMITS } from '../../src/worker/plausible.js';
import { signToken, verifyToken } from '../../src/worker/token.js';
import { handleApi, resetSchemaCache, RATE } from '../../src/worker/scores.js';
import { fakeD1 } from './fake-d1.js';

describe('initials filter', () => {
  it('accepts three letters and normalises case', () => {
    expect(cleanInitials('cld')).toBe('CLD');
    expect(cleanInitials(' Max ')).toBe('MAX');
  });
  it('rejects anything that is not exactly three letters', () => {
    for (const bad of ['', 'AB', 'ABCD', 'A1C', 'A C', 'ÄBC', null, 42, '<b>']) expect(cleanInitials(bad)).toBeNull();
  });
  it('rejects blocklisted initials in any case', () => {
    for (const bad of ['ASS', 'fuk', 'KkK', 'nig']) expect(cleanInitials(bad)).toBeNull();
  });
});

describe('plausibility', () => {
  const ok = { score: 400000, distance: 2500, durationMs: 60000, warps: 3 };
  it('passes a strong but real run', () => {
    expect(implausible(ok, 61000)).toBeNull();
  });
  it('rejects a run longer than the time since its token was issued', () => {
    expect(implausible({ ...ok, durationMs: 120000 }, 61000)).toMatch(/longer/);
  });
  it('rejects impossible scoring and distance rates', () => {
    expect(implausible({ ...ok, score: LIMITS.maxPointsPerSec * 61 + 60000 }, 61000)).toMatch(/score/);
    expect(implausible({ ...ok, distance: LIMITS.maxMetersPerSec * 61 + 500 }, 61000)).toMatch(/distance/);
  });
  it('penalty scoring (0073): score must equal earned minus the recomputed penalty', () => {
    const pen = { obstacle: [80], traffic: [60], wallMs: 1500 };
    // 5000+150*80 + 6000+180*60 + 4000*1.5 = 17000 + 16800 + 6000 = 39800
    expect(implausible({ ...ok, earned: 439800, pen }, 61000)).toBeNull();
    expect(implausible({ ...ok, earned: 400000, pen }, 61000)).toMatch(/penalt/);
    expect(implausible({ ...ok, earned: 439800, pen: { ...pen, obstacle: [80.5] } }, 61000)).toMatch(/log/);
    expect(implausible({ ...ok, earned: 439800, pen: { ...pen, wallMs: 99e6 } }, 61000)).toMatch(/log/);
    expect(implausible({ ...ok, earned: 439800 }, 61000)).toMatch(/log/);
    // A score floored at zero by penalties is still consistent.
    expect(implausible({ ...ok, score: 0, earned: 20000, pen }, 61000)).toBeNull();
    // Rate limits apply to what was earned before penalties.
    const huge = LIMITS.maxPointsPerSec * 61 + 60000;
    expect(implausible({ ...ok, score: huge - 39800 - 1000, earned: huge - 1000 + 1000, pen }, 61000)).toMatch(/score/);
  });
  it('rejects junk numbers, tiny runs and stale tokens', () => {
    expect(implausible({ ...ok, score: -1 }, 61000)).toMatch(/bad/);
    expect(implausible({ ...ok, score: 1.5 }, 61000)).toMatch(/bad/);
    expect(implausible({ ...ok, durationMs: 1000 }, 61000)).toMatch(/short/);
    expect(implausible(ok, LIMITS.maxDurationMs + 1)).toMatch(/expired/);
  });
});

describe('run tokens', () => {
  it('round-trips and rejects tampering or the wrong key', async () => {
    const tok = await signToken({ id: 'abc', t: 1000 }, 'k1');
    expect(await verifyToken(tok, 'k1')).toEqual({ id: 'abc', t: 1000 });
    expect(await verifyToken(tok, 'k2')).toBeNull();
    const [body, sig] = tok.split('.');
    const forged = btoa(JSON.stringify({ id: 'abc', t: 0 })).replace(/=+$/, '');
    expect(await verifyToken(`${forged}.${sig}`, 'k1')).toBeNull();
    expect(await verifyToken(`${body}.`, 'k1')).toBeNull();
    expect(await verifyToken('garbage', 'k1')).toBeNull();
  });
});

describe('leaderboard API', () => {
  let db, clock, ip;
  const deps = () => ({ db, now: () => clock, ip });
  const call = async (method, path, body) => {
    const req = new Request(`https://mutaafaziz.com${path}`, {
      method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const res = await handleApi(req, deps());
    return { status: res.status, body: await res.json() };
  };
  const runToken = async () => (await call('POST', '/outatime/api/run')).body.token;
  const submit = (token, extra = {}) => call('POST', '/outatime/api/scores', {
    token, initials: 'CLD', score: 300000, distance: 2000, durationMs: 60000, warps: 2, level: 0, mode: 'ARCADE', ...extra,
  });

  beforeEach(() => {
    resetSchemaCache();
    db = fakeD1();
    clock = Date.UTC(2026, 9, 17, 12, 0, 0);
    ip = '203.0.113.7';
  });

  it('accepts a signed, plausible run and ranks it on both boards', async () => {
    const token = await runToken();
    clock += 61000;
    const r = await submit(token);
    expect(r.status).toBe(200);
    expect(r.body.rank).toEqual({ all: 1, daily: 1 });
    const board = await call('GET', '/outatime/api/scores?board=all');
    expect(board.body.entries).toEqual([{ rank: 1, initials: 'CLD', score: 300000 }]);
    // Nothing identifying is stored: only a daily-salted hash of the IP.
    const row = db.raw.prepare('SELECT * FROM scores').get();
    expect(JSON.stringify(row)).not.toContain('203.0.113.7');
  });

  it('refuses a reused token, a forged token and an impossible run', async () => {
    const token = await runToken();
    clock += 61000;
    expect((await submit(token)).status).toBe(200);
    expect((await submit(token)).status).toBe(409);
    expect((await submit(`${token}x`)).status).toBe(403);
    const t2 = await runToken();
    clock += 10000;
    expect((await submit(t2, { score: 90_000_000 })).status).toBe(422);
  });

  it('rejects bad initials, modes and levels before touching the token', async () => {
    const token = await runToken();
    clock += 61000;
    expect((await submit(token, { initials: 'ASS' })).status).toBe(400);
    expect((await submit(token, { mode: 'GOD' })).status).toBe(400);
    expect((await submit(token, { level: -1 })).status).toBe(400);
  });

  it('keeps one row per initials on the board (their best) and separates daily from all-time', async () => {
    const post = async (initials, score) => { const t = await runToken(); clock += 61000; return submit(t, { initials, score }); };
    await post('AAA', 100000);
    await post('BBB', 500000);
    await post('AAA', 700000);
    clock += 24 * 3600e3; // next UTC day
    const r = await post('CCC', 200000);
    expect(r.body.rank).toEqual({ all: 3, daily: 1 });
    const all = (await call('GET', '/outatime/api/scores?board=all')).body.entries;
    expect(all.map((e) => `${e.initials}:${e.score}`)).toEqual(['AAA:700000', 'BBB:500000', 'CCC:200000']);
    const daily = (await call('GET', '/outatime/api/scores?board=daily')).body.entries;
    expect(daily.map((e) => e.initials)).toEqual(['CCC']);
  });

  it('rate-limits one address', async () => {
    for (let i = 0; i < RATE.maxSubmits; i++) {
      const t = await runToken(); clock += 5000;
      expect((await submit(t, { score: 1000, distance: 100, durationMs: 4500 })).status).toBe(200);
    }
    const t = await runToken(); clock += 5000;
    expect((await submit(t, { score: 1000, distance: 100, durationMs: 4500 })).status).toBe(429);
    ip = '198.51.100.9';
    const t2 = await runToken(); clock += 5000;
    expect((await submit(t2, { score: 1000, distance: 100, durationMs: 4500 })).status).toBe(200);
  });

  it('reports offline cleanly when the database binding is missing', async () => {
    db = undefined;
    const r = await call('GET', '/outatime/api/scores');
    expect(r.status).toBe(503);
  });
});
