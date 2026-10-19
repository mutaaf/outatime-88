// Fair play on the server (ticket 0180): payload v4's counters are checked against the sim's
// caps. Forged shapes are rejected; rule breaks keep the run but hide it from everyone else.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleApi, resetSchemaCache, RATE } from '../../src/worker/scores.js';
import { prune } from '../../src/worker/compete.js';
import { LEGACY_UNTIL } from '../../src/worker/payload.js';
import { COOKIE } from '../../src/worker/identity.js';
import { fakeD1 } from './fake-d1.js';

const PEN = { obstacle: [], traffic: [], cone: [], wallMs: 0, wallN: 0, wallBill: 0 };
const FP = { simMs: 59000, jumps: 20, airs: 30, tricks: 12, airMs: 9000, topMph: 130, jukes: 4, autoMs: 0 };

describe('fair play API', () => {
  let db, clock, ip;
  const jars = {};
  const call = async (who, method, path, body) => {
    const h = { 'content-type': 'application/json' };
    if (who && jars[who]) h.cookie = `${COOKIE}=${jars[who]}`;
    const res = await handleApi(new Request(`https://mutaafaziz.com${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), { db, now: () => clock, ip });
    const set = res.headers.get('set-cookie');
    if (who && set) jars[who] = set.match(new RegExp(`${COOKIE}=([^;]*)`))[1];
    return { status: res.status, body: await res.json() };
  };
  const post = async (who, initials, score, extra = {}) => {
    await call(who, 'GET', '/outatime/api/me'); // a racer id, like the game does at boot
    const { token } = (await call(who, 'POST', '/outatime/api/run')).body;
    clock += 61000;
    ip = `10.1.0.${Math.floor(Math.random() * 250)}`;
    return call(who, 'POST', '/outatime/api/scores', {
      token, initials, score, earned: score, pen: PEN, fp: FP, distance: 2000, durationMs: 60000, warps: 1, level: 0, mode: 'ARCADE', ...extra,
    });
  };
  const board = async (who) => (await call(who, 'GET', '/outatime/api/scores?board=all&limit=10')).body.entries.map((e) => `${e.initials}:${e.score}`);

  beforeEach(() => {
    resetSchemaCache();
    db = fakeD1();
    clock = Date.UTC(2026, 9, 21, 12);
    ip = '203.0.113.7';
    for (const k of Object.keys(jars)) delete jars[k];
  });

  it('an honest v4 run ranks like before', async () => {
    const r = await post('a', 'AAA', 300000);
    expect(r.status).toBe(200);
    expect(r.body.unranked).toBeUndefined();
    expect(await board('b')).toEqual(['AAA:300000']);
    expect(db.raw.prepare('SELECT pv, flag FROM scores').get()).toEqual({ pv: 4, flag: '' });
  });

  it('rejects forged counters outright', async () => {
    for (const fp of [{ ...FP, jumps: -1 }, { ...FP, tricks: 2.5 }, { simMs: 1 }, 'x']) {
      expect((await post('a', 'AAA', 1000, { fp })).status).toBe(422);
    }
  });

  it('a run that broke the rules is kept for its own device and hidden from everyone else', async () => {
    await post('honest', 'HON', 500000);
    const r = await post('cheat', 'CHT', 9000000, { fp: { ...FP, tricks: 500 } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true); // shadow: the cheater sees an ordinary result
    expect(db.raw.prepare("SELECT flag FROM scores WHERE initials = 'CHT'").get().flag).toBe('trick spam');
    expect(await board('honest')).toEqual(['HON:500000']);
    expect(await board('stranger')).toEqual(['HON:500000']);
    expect(await board('cheat')).toEqual(['CHT:9000000', 'HON:500000']);
    // Nobody else's rank moves because of it.
    const r2 = await post('late', 'LTE', 400000);
    expect(r2.body.rank.all).toBe(2);
  });

  it('each cheat kind is flagged', async () => {
    const cheats = [
      { simMs: 600000 }, { airMs: 70000 }, { topMph: 999 }, { topMph: 20 },
      { jumps: 400, airs: 400 }, { airs: 9000 }, { tricks: 91 }, { jukes: 200 },
    ];
    for (const patch of cheats) {
      const r = await post('c', 'CHT', 1000, { fp: { ...FP, ...patch } });
      expect(r.status).toBe(200);
    }
    const flags = db.raw.prepare("SELECT flag FROM scores WHERE initials = 'CHT'").all().map((x) => x.flag);
    expect(flags.every(Boolean)).toBe(true);
    expect(flags).toHaveLength(cheats.length);
  });

  it('autopilot runs are told they are unranked', async () => {
    const r = await post('bot', 'BOT', 200000, { fp: { ...FP, autoMs: 50000 } });
    expect(r.body.unranked).toBe('assist');
    expect(await board('other')).toEqual([]);
    expect(await board('bot')).toEqual(['BOT:200000']);
  });

  it('old payloads count until the cutoff, then are kept unranked', async () => {
    const v3 = { fp: undefined };
    expect((await post('old', 'OLD', 100000, v3)).status).toBe(200);
    expect(await board('x')).toEqual(['OLD:100000']);
    clock = LEGACY_UNTIL + 1000;
    expect((await post('old2', 'OLX', 200000, v3)).status).toBe(200);
    expect(await board('x')).toEqual(['OLD:100000']);
  });

  it('a flagged run never prunes an honest one with the same initials', async () => {
    await post('kid', 'MAX', 100000);
    await post('cheat', 'MAX', 9000000, { fp: { ...FP, tricks: 500 } });
    await prune(db, clock + 90 * 86400e3);
    expect(await board('x')).toEqual(['MAX:100000']);
  });

  it('limits submits per racer as well as per address, and run tokens per address', async () => {
    await call('p', 'GET', '/outatime/api/me');
    for (let i = 0; i < RATE.maxSubmits; i++) {
      const { token } = (await call('p', 'POST', '/outatime/api/run')).body;
      clock += 5000;
      ip = `10.2.0.${i}`; // a new network each time
      expect((await call('p', 'POST', '/outatime/api/scores', { token, initials: 'PPP', score: 1000, distance: 100, durationMs: 4500, warps: 0, level: 0, mode: 'ARCADE' })).status).toBe(200);
    }
    const { token } = (await call('p', 'POST', '/outatime/api/run')).body;
    clock += 5000;
    ip = '10.3.0.1';
    expect((await call('p', 'POST', '/outatime/api/scores', { token, initials: 'PPP', score: 1000, distance: 100, durationMs: 4500, warps: 0, level: 0, mode: 'ARCADE' })).status).toBe(429);

    ip = '198.51.100.1';
    let last = 0;
    for (let i = 0; i <= RATE.maxRunsPerHour; i++) last = (await call(null, 'POST', '/outatime/api/run')).status;
    expect(last).toBe(429);
  });
});
