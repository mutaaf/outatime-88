// Competition layer (tickets 0051–0053) against real SQLite: rank movement, rivals, seasons,
// hall of fame, who-passed-you, streaks, friends/track/class boards, payload versions, ghosts.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleApi, resetSchemaCache } from '../../src/worker/scores.js';
import { weekStart, seasonOf, prune } from '../../src/worker/compete.js';
import { readPayload } from '../../src/worker/payload.js';
import { encodeGhost } from '../../src/ghost-codec.js';
import { COOKIE } from '../../src/worker/identity.js';
import { fakeD1 } from './fake-d1.js';

const DAY = 86400e3;

describe('seasons', () => {
  it('run Monday to Sunday in UTC', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    const s = seasonOf(Date.UTC(2026, 9, 21, 15));
    expect(s.week).toBe('2026-10-19');
    expect(s.endsAt - s.start).toBe(7 * DAY);
  });
});

describe('payload versions', () => {
  const base = { score: 1000, distance: 100, durationMs: 9000, warps: 0 };
  it('tell v1 from penalty-scored v2 runs and keep car/class', () => {
    expect(readPayload(base)).toEqual({ pv: 1, car: '', cls: '' });
    expect(readPayload({ ...base, earned: 1500, pen: { obstacle: [], traffic: [], wallMs: 0 }, car: 'ARC_MK88', cls: 'B' })).toEqual({ pv: 2, car: 'ARC_MK88', cls: 'B' });
    expect(readPayload({ ...base, v: 3 }).error).toMatch(/version/);
    expect(readPayload({ ...base, v: 2 }).error).toMatch(/penalty/);
    expect(readPayload({ ...base, car: 'bad car!', cls: 'xx' })).toEqual({ pv: 1, car: '', cls: '' });
  });
});

describe('competition API', () => {
  let db, clock, ip, rand;
  const jars = {};
  const call = async (who, method, path, body) => {
    const h = { 'content-type': 'application/json' };
    if (who && jars[who]) h.cookie = `${COOKIE}=${jars[who]}`;
    const res = await handleApi(new Request(`https://mutaafaziz.com${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), { db, now: () => clock, ip, rand });
    const set = res.headers.get('set-cookie');
    if (who && set) jars[who] = set.match(new RegExp(`${COOKIE}=([^;]*)`))[1];
    return { status: res.status, body: await res.json() };
  };
  const post = async (initials, score, extra = {}, who = initials) => {
    const { token } = (await call(who, 'POST', '/outatime/api/run')).body;
    clock += 61000;
    ip = `10.0.0.${Math.floor(Math.random() * 250)}`; // stay clear of the per-address limit
    return call(who, 'POST', '/outatime/api/scores', { token, initials, score, distance: 2000, durationMs: 60000, warps: 1, level: 0, mode: 'ARCADE', ...extra });
  };
  const board = async (q, who) => (await call(who, 'GET', `/outatime/api/scores?${q}`)).body;

  beforeEach(() => {
    resetSchemaCache();
    db = fakeD1();
    clock = Date.UTC(2026, 9, 21, 12); // a Wednesday
    ip = '203.0.113.7';
    rand = () => 1; // no random pruning unless a test asks
    for (const k of Object.keys(jars)) delete jars[k];
  });

  it('reports rank movement, personal best and the next target after a run', async () => {
    await post('ACE', 900000);
    await post('BIF', 600000);
    await post('DOC', 400000);
    const first = (await post('CLD', 300000)).body;
    expect(first.boards.all).toMatchObject({ rank: 4, prevRank: null, pb: true, ahead: { initials: 'DOC', score: 400000, gap: 100000, rank: 3 } });
    const better = (await post('CLD', 650000)).body;
    expect(better.boards.all).toMatchObject({ rank: 2, prevRank: 4, pb: true, prevBest: 300000, ahead: { initials: 'ACE', gap: 250000 }, behind: { initials: 'BIF' } });
    const worse = (await post('CLD', 100000)).body;
    expect(worse.boards.all).toMatchObject({ rank: 2, prevRank: 2, pb: false, best: 650000 });
    expect(worse.boards.track.rank).toBe(2);
    expect(worse.season.week).toBe('2026-10-19');
  });

  it('runs weekly seasons with a reset and a hall of fame', async () => {
    await post('ACE', 900000);
    await post('CLD', 500000);
    clock += 7 * DAY; // next week
    await post('CLD', 200000);
    const week = await board('board=week');
    expect(week.entries.map((e) => e.initials)).toEqual(['CLD']);
    const all = await board('board=all');
    expect(all.entries.map((e) => e.initials)).toEqual(['ACE', 'CLD']);
    const hall = (await call(null, 'GET', '/outatime/api/hall?mode=ARCADE')).body;
    expect(hall.champions).toEqual([{ week: '2026-10-19', initials: 'ACE', score: 900000 }]);
  });

  it('per-track and per-class boards, and your own row when you are outside the top N', async () => {
    await post('ACE', 900000, { level: 1 });
    await post('BIF', 800000, { level: 0, car: 'ROCKET', cls: 'A' });
    await post('CLD', 100000, { level: 0 });
    expect((await board('board=all&level=1')).entries.map((e) => e.initials)).toEqual(['ACE']);
    expect((await board('board=all&cls=A')).entries.map((e) => e.initials)).toEqual(['BIF']);
    const top1 = await board('board=all&limit=1&around=CLD');
    expect(top1.entries).toHaveLength(1);
    expect(top1.me).toEqual({ rank: 3, initials: 'CLD', score: 100000 });
  });

  it('friends board: you and the racers in your profile only', async () => {
    await call('CLD', 'GET', '/outatime/api/me');
    await call('ZED', 'GET', '/outatime/api/me');
    const zed = (await call('ZED', 'GET', '/outatime/api/me')).body.pub;
    await call('CLD', 'POST', '/outatime/api/me/friends', { add: [zed] });
    await post('CLD', 300000);
    await post('ZED', 500000);
    await post('ACE', 900000);
    const f = await board('board=friends', 'CLD');
    expect(f.entries.map((e) => e.initials)).toEqual(['ZED', 'CLD']);
    expect((await board('board=friends')).entries).toEqual([]);
  });

  it('standing: rival, and who took your spot since you last looked', async () => {
    await post('ACE', 900000);
    await post('CLD', 500000);
    const lastSeen = clock;
    await post('ZED', 700000);
    await post('ACE', 950000); // was already above you: not news
    const s = (await call('CLD', 'GET', `/outatime/api/standing?initials=CLD&mode=ARCADE&level=0&since=${lastSeen}`)).body;
    expect(s.boards.all).toMatchObject({ rank: 3, ahead: { initials: 'ZED', gap: 200000 } });
    expect(s.overtaken).toEqual([{ initials: 'ZED', score: 700000 }]);
    expect(s.boards.track.rank).toBe(3);
    const none = (await call('CLD', 'GET', `/outatime/api/standing?initials=CLD&since=${clock}`)).body;
    expect(none.overtaken).toEqual([]);
    expect((await call(null, 'GET', '/outatime/api/standing?initials=ASS')).status).toBe(400);
  });

  it('daily streaks count consecutive days per racer', async () => {
    await call('CLD', 'GET', '/outatime/api/me');
    const daily = (extra = {}) => post('CLD', 100000, { mode: 'DAILY', ...extra });
    expect((await daily()).body.streak).toEqual({ days: 1, today: true });
    clock += DAY;
    expect((await daily()).body.streak.days).toBe(2);
    clock += DAY;
    const s = (await call('CLD', 'GET', '/outatime/api/standing?initials=CLD&mode=DAILY')).body.streak;
    expect(s).toEqual({ days: 2, today: false }); // still alive until today ends
    clock += DAY;
    expect((await daily()).body.streak.days).toBe(1); // missed a day
  });

  it('stores a believable ghost per initials per track, rejects a forged one, and serves it', async () => {
    const trace = (dist, secs, x = 0.2) => encodeGhost(Array.from({ length: secs * 5 }, (_, i) => ({ d: (dist * (i + 1)) / (secs * 5), x })));
    expect((await post('CLD', 300000, { trace: trace(2000, 58) })).body.ghost).toBe('kept');
    expect((await post('CLD', 200000, { trace: trace(2000, 58) })).body.ghost).toBe('not a best');
    expect((await post('ZED', 100000, { trace: trace(9000, 58) })).body.ghost).toBe('distance mismatch');
    expect((await post('ZED', 100000, { trace: trace(2000, 90) })).body.ghost).toBe('longer than the run');
    expect((await post('ZED', 100000, { trace: 'garbage!' })).body.ghost).toBe('malformed');
    const top = (await call(null, 'GET', '/outatime/api/ghost?mode=ARCADE&level=0')).body;
    expect(top).toMatchObject({ initials: 'CLD', score: 300000 });
    expect(top.trace).toBe(trace(2000, 58));
    expect((await call(null, 'GET', '/outatime/api/ghost?mode=ARCADE&level=3')).status).toBe(404);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM ghosts').get().n).toBe(1);
  });

  it('prunes runs that no board can show, keeping every best and each closed season winner', async () => {
    await post('CLD', 100000);
    await post('CLD', 300000);
    await post('CLD', 200000);
    await post('ACE', 900000);
    clock += 2 * DAY;
    await prune(db, clock);
    expect(db.raw.prepare('SELECT initials, score FROM scores ORDER BY score').all().map((r) => `${r.initials}:${r.score}`)).toEqual(['CLD:300000', 'ACE:900000']);
    clock += 70 * DAY;
    await post('CLD', 250000);
    await prune(db, clock);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM scores').get().n).toBe(3);
    expect((await call(null, 'GET', '/outatime/api/hall?mode=ARCADE')).body.champions[0]).toMatchObject({ week: '2026-10-19', initials: 'ACE' });
  });
});
