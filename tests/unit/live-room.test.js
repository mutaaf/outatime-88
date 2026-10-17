// Live rooms (sprint 3): the room state machine, CPU grid, finish order and abuse limits.
import { describe, it, expect } from 'vitest';
import { RoomCore, allow } from '../../src/worker/room-core.js';
import {
  LIVE, LENGTHS, LEVEL_COUNT, makeCode, cleanCode, cpuProfile, cpuZ, cpuFinishMs, rankResults,
  cleanFrame, acceptFinish, cleanConfig,
} from '../../src/worker/live-rules.js';
import { pickRoom } from '../../src/worker/match.js';
import { createAllowed, sameOrigin } from '../../src/worker/live.js';
import { WORLD_LEVELS } from '../../src/data.js';

let n = 0;
const mint = () => `id${++n}`;
const fixed = (v) => () => v;

function room(opts = {}) {
  return new RoomCore({ code: 'BCDF', now: 0, ...opts });
}
const msgsTo = (out, id) => out.filter((o) => o.to === id || (o.to === 'all' && o.except !== id)).map((o) => o.msg);

describe('room codes and config', () => {
  it('makes 4-consonant codes and rejects anything else', () => {
    const code = makeCode(Math.random);
    expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(cleanCode(' bcdf ')).toBe('BCDF');
    for (const bad of ['ABCD', 'BCD', 'BCDFG', '12AB', '', null]) expect(cleanCode(bad)).toBeNull();
  });
  it('level count matches the game and config is clamped', () => {
    expect(LEVEL_COUNT).toBe(WORLD_LEVELS.length);
    expect(cleanConfig({ level: 99, len: -1 })).toEqual({ level: 0, len: 0 });
    expect(cleanConfig({ level: 2, len: 1 })).toEqual({ level: 2, len: 1 });
    const test = LENGTHS.findIndex((l) => l.test);
    expect(cleanConfig({ len: test })).toEqual({ level: 0, len: 0 }); // production rooms refuse it
    expect(cleanConfig({ len: test }, undefined, true).len).toBe(test);
  });
});

describe('joining', () => {
  it('first joiner hosts; a share-link joiner gets a seat and a welcome with a reconnect key', () => {
    const r = room();
    const a = r.join({ name: 'ace', car: 2 }, 1, mint);
    const b = r.join({ name: 'ZAP', car: 3 }, 2, mint);
    expect(r.hostId).toBe(a.player.id);
    expect(a.player.name).toBe('ACE');
    expect(msgsTo(b.out, b.player.id)[0]).toMatchObject({ t: 'welcome', id: b.player.id, key: b.player.key });
    const snap = r.snapshot(3);
    expect(snap.players.map((p) => p.name)).toEqual(['ACE', 'ZAP']);
    expect(JSON.stringify(snap)).not.toContain(b.player.key);
  });
  it('rude or invalid initials never make it in', () => {
    const r = room();
    const p = r.join({ name: 'ASS' }, 1, mint).player;
    expect(p.name).toMatch(/^[A-Z]{3}$/);
    expect(p.name).not.toBe('ASS');
  });
  it('two players never share initials', () => {
    const r = room();
    r.join({ name: 'ZAP' }, 1, mint);
    const b = r.join({ name: 'ZAP' }, 2, mint).player;
    expect(b.name).toBe('ZAQ');
    const c = r.join({ name: 'ACE' }, 3, mint).player;
    r.set(c.id, { name: 'ZAP' }, 4);
    expect(new Set(r.players.map((p) => p.name)).size).toBe(3);
  });
  it('caps a room at six players', () => {
    const r = room();
    for (let i = 0; i < LIVE.maxPlayers; i++) expect(r.join({ name: 'AAB' }, i, mint).error).toBeUndefined();
    expect(r.join({ name: 'AAB' }, 9, mint).error).toBe('FULL');
  });
  it('reconnect with id+key reclaims the same seat; a wrong key does not', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 1, mint).player;
    r.join({ name: 'ZAP' }, 2, mint);
    r.drop(a.id, 3);
    expect(r.hostId).not.toBe(a.id); // host migrated
    const back = r.join({ id: a.id, key: a.key }, 4, mint);
    expect(back.player).toBe(a);
    expect(r.players).toHaveLength(2);
    const imposter = r.join({ id: a.id, key: 'nope', name: 'BAD' }, 5, mint);
    expect(imposter.player).not.toBe(a);
  });
  it('seats follow the racer identity: same racer, same seat, no key needed', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 1, mint, 'abcdefghijk2').player;
    r.join({ name: 'ZAP' }, 2, mint, 'zzzzzzzzzzz7');
    r.drop(a.id, 3);
    const back = r.join({ name: 'ACE' }, 4, mint, 'abcdefghijk2'); // new tab, no seat key
    expect(back.player).toBe(a);
    expect(r.players).toHaveLength(2);
    const snap = r.snapshot(5);
    expect(snap.players.map((p) => p.pub)).toEqual(['abcdefghijk2', 'zzzzzzzzzzz7']); // public ids only
    expect(JSON.stringify(snap)).not.toContain(a.key);
  });
  it('drops a seat whose owner stays gone between races', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 0, mint).player;
    r.join({ name: 'ZAP' }, 0, mint);
    r.drop(a.id, 100);
    r.tick(100 + LIVE.dropMs - 1, Math.random);
    expect(r.players).toHaveLength(2);
    r.tick(100 + LIVE.dropMs + 1, Math.random);
    expect(r.players).toHaveLength(1);
  });
});

describe('starting', () => {
  it('only the host can start; everyone gets the same seed and start time; CPUs fill the grid', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 0, mint).player;
    const b = r.join({ name: 'ZAP' }, 0, mint).player;
    expect(r.start(b.id, 10, fixed(0.5))).toEqual([]);
    const out = r.start(a.id, 10, fixed(0.5));
    const snap = out[0].msg;
    expect(out[0].to).toBe('all');
    expect(snap.state).toBe('COUNTDOWN');
    expect(snap.startAt).toBe(10 + LIVE.countdownMs);
    expect(snap.endAt).toBe(snap.startAt + LENGTHS[0].capMs);
    expect(snap.seed).toBeGreaterThan(0);
    expect(snap.players.map((p) => p.slot)).toEqual([0, 1]);
    expect(snap.cpus.map((c) => c.slot)).toEqual([2, 3, 4, 5]);
    r.tick(10 + LIVE.countdownMs, Math.random);
    expect(r.state).toBe('RACING');
  });
  it('a solo host still gets a full grid', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 0, mint).player;
    r.start(a.id, 0, Math.random);
    expect(r.cpus).toHaveLength(LIVE.grid - 1);
  });
  it('everyone ready (2+) auto-starts after a short countdown; un-readying cancels it', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 0, mint).player;
    const b = r.join({ name: 'ZAP' }, 0, mint).player;
    r.set(a.id, { ready: true }, 0);
    expect(r.autoAt).toBe(0);
    r.set(b.id, { ready: true }, 100);
    expect(r.autoAt).toBe(100 + LIVE.autoStartMs);
    r.set(a.id, { ready: false }, 200);
    expect(r.autoAt).toBe(0);
    r.set(a.id, { ready: true }, 300);
    r.tick(300 + LIVE.autoStartMs, Math.random);
    expect(r.state).toBe('COUNTDOWN');
  });
  it('late joiners spectate the race in progress and race the next one', () => {
    const r = room();
    const a = r.join({ name: 'ACE' }, 0, mint).player;
    r.start(a.id, 0, Math.random);
    const late = r.join({ name: 'LAT' }, 100, mint).player;
    expect(late.spectate).toBe(true);
    expect(late.racer).toBe(false);
    r.tick(LIVE.countdownMs, Math.random);
    expect(r.frame(late.id, [10, 0, 0, 50, 0], LIVE.countdownMs + 10)).toEqual([]);
    r.endRace(LIVE.countdownMs + 60000);
    expect(late.spectate).toBe(false);
  });
  it('quick race: the first joiner starts a timer that runs even with one player', () => {
    const r = room({ isPublic: true });
    r.join({ name: 'ACE' }, 1000, mint);
    expect(r.autoAt).toBe(1000 + LIVE.publicWaitMs);
    expect(r.open).toBe(true);
    r.tick(1000 + LIVE.publicWaitMs, Math.random);
    expect(r.state).toBe('COUNTDOWN');
    expect(r.open).toBe(false);
  });
});

function racingRoom(len = 0) {
  const r = room();
  const a = r.join({ name: 'ACE' }, 0, mint).player;
  const b = r.join({ name: 'ZAP' }, 0, mint).player;
  r.config(a.id, { len }, 0);
  r.start(a.id, 0, fixed(0.25));
  r.tick(r.startAt, Math.random);
  return { r, a, b, t0: r.startAt, Z: LENGTHS[len].dist };
}

describe('racing', () => {
  it('relays frames to everyone else only, clamped to what physics allows', () => {
    const { r, a, t0 } = racingRoom();
    const out = r.frame(a.id, [1e9, 99999, 0, 80, 3], t0 + 1000);
    expect(out).toHaveLength(1);
    expect(out[0].except).toBe(a.id);
    expect(out[0].msg.d[0]).toBeLessThanOrEqual(175 + 150);
    expect(out[0].msg.d[1]).toBe(1500);
    expect(r.frame(a.id, [1, 2, 3], t0 + 1000)).toEqual([]);
    expect(r.frame(a.id, [NaN, 0, 0, 0, 0], t0 + 1000)).toEqual([]);
  });
  it('a finish needs real distance driven and a believable time', () => {
    const { r, a, t0, Z } = racingRoom();
    expect(r.finish(a.id, 1000, r.race, t0 + 1000)).toEqual([]); // never got near the line
    expect(a.ms).toBeNull();
    const at = t0 + 50000;
    r.frame(a.id, [Z, 0, 0, 90, 0], at - 100);
    r.finish(a.id, 1000, r.race, at); // claims 1 s; server clock says 50 s
    expect(a.ms).toBe(50000);
  });
  it('finish order: humans and CPUs by time, DNFs by distance; the winner banks a win', () => {
    const { r, a, b, t0, Z } = racingRoom();
    r.frame(b.id, [Z, 0, 0, 90, 0], t0 + 29000);
    r.finish(b.id, 29000, r.race, t0 + 29000);
    expect(r.state).toBe('RACING');
    r.frame(a.id, [Z, 0, 0, 90, 0], t0 + 31000);
    const out = r.finish(a.id, 31000, r.race, t0 + 31000);
    expect(r.state).toBe('RESULTS'); // everyone connected finished
    const res = out[0].msg.results;
    const names = res.map((x) => x.name);
    expect(names.indexOf('ZAP')).toBeLessThan(names.indexOf('ACE'));
    expect(res.map((x) => x.place)).toEqual([1, 2, 3, 4, 5, 6]);
    const finished = res.filter((x) => x.ms != null);
    for (let i = 1; i < finished.length; i++) expect(finished[i].ms).toBeGreaterThanOrEqual(finished[i - 1].ms);
    if (res[0].name === 'ZAP') expect(b.wins).toBe(1);
  });
  it('first finisher starts the grace clock; the deadline ends the race for everyone', () => {
    const { r, a, t0, Z } = racingRoom();
    r.frame(a.id, [Z, 0, 0, 90, 0], t0 + 40000);
    r.finish(a.id, 40000, r.race, t0 + 40000);
    expect(r.endAt).toBe(t0 + 40000 + LIVE.finishGraceMs);
    r.tick(t0 + 40000 + LIVE.finishGraceMs, Math.random);
    expect(r.state).toBe('RESULTS');
    const zap = r.results.find((x) => x.name === 'ZAP');
    expect(zap.ms).toBeNull();
  });
  it('a racer who disconnects mid-race does not hold everyone up', () => {
    const { r, a, b, t0, Z } = racingRoom();
    r.frame(a.id, [Z, 0, 0, 90, 0], t0 + 40000);
    r.finish(a.id, 40000, r.race, t0 + 40000);
    r.drop(b.id, t0 + 41000);
    expect(r.state).toBe('RESULTS');
  });
  it('stale finishes from a previous race are ignored', () => {
    const { r, a, t0, Z } = racingRoom();
    r.frame(a.id, [Z, 0, 0, 90, 0], t0 + 40000);
    expect(r.finish(a.id, 40000, r.race - 1, t0 + 40000)).toEqual([]);
  });
  it('rematch: everyone stays in the room and readies up again', () => {
    const { r, a, b, t0 } = racingRoom();
    r.endRace(t0 + 100000);
    expect(r.players).toHaveLength(2);
    expect(r.state).toBe('RESULTS');
    r.set(a.id, { ready: true }, t0 + 101000);
    r.set(b.id, { ready: true }, t0 + 101000);
    r.tick(t0 + 101000 + LIVE.autoStartMs, fixed(0.75));
    expect(r.state).toBe('COUNTDOWN');
    expect(r.race).toBe(2);
  });
  it('survives a JSON round trip (Durable Object hibernation)', () => {
    const { r } = racingRoom();
    const back = RoomCore.from(JSON.parse(JSON.stringify(r.toJSON())));
    expect(back.snapshot(1)).toEqual(r.snapshot(1));
  });
});

describe('CPU racers', () => {
  it('are deterministic from the seed and monotonic', () => {
    const p = cpuProfile(1234, 2);
    expect(cpuProfile(1234, 2)).toEqual(p);
    let prev = -1;
    for (let t = 0; t < 200; t += 0.25) { const z = cpuZ(p, t); expect(z).toBeGreaterThanOrEqual(prev); prev = z; }
  });
  it('finish each length in a race-shaped time', () => {
    for (let k = 0; k < 5; k++) {
      const p = cpuProfile(99 + k, k);
      for (const L of LENGTHS.filter((x) => !x.test)) {
        const ms = cpuFinishMs(p, L.dist);
        expect(ms).toBeGreaterThan(L.dist / 175 * 1000);
        expect(ms).toBeLessThan(L.capMs * 0.75); // CPUs finish well inside the cap
        expect(Math.abs(cpuZ(p, ms / 1000) - L.dist)).toBeLessThan(1);
      }
    }
  });
});

describe('limits', () => {
  it('rankResults puts finishers first by time, then distance', () => {
    const res = rankResults([
      { id: 'a', ms: null, z: 10 }, { id: 'b', ms: 5000, z: 0 }, { id: 'c', ms: null, z: 20 }, { id: 'd', ms: 4000 },
    ]);
    expect(res.map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('acceptFinish never beats physics and snaps wild clocks to the server', () => {
    expect(acceptFinish(10, 1000, 3600)).toBeGreaterThanOrEqual(3600 / 175 * 1000);
    expect(acceptFinish(30000, 60000, 3600)).toBe(60000);
    expect(acceptFinish(59000, 60000, 3600)).toBe(59000);
  });
  it('cleanFrame rejects malformed frames', () => {
    expect(cleanFrame('x', 0)).toBeNull();
    expect(cleanFrame([1, 2, 3, 4, 'a'], 0)).toBeNull();
    expect(cleanFrame([1, 2, 3, 4, 5], 0)).toEqual([1, 2, 3, 4, 5]);
  });
  it('token bucket allows a burst then throttles', () => {
    const b = {};
    let ok = 0;
    for (let i = 0; i < 100; i++) if (allow(b, 1000)) ok++;
    expect(ok).toBe(LIVE.rate.burst);
    expect(allow(b, 1000 + 1000)).toBe(true);
  });
  it('room creation is throttled per IP', () => {
    const m = new Map();
    let ok = 0;
    for (let i = 0; i < 20; i++) if (createAllowed('1.2.3.4', 0, m)) ok++;
    expect(ok).toBe(10);
    expect(createAllowed('1.2.3.4', 61e3, m)).toBe(true);
  });
  it('sockets must come from our own origin', () => {
    const url = new URL('https://mutaafaziz.com/outatime/api/room/BCDF');
    const req = (origin) => ({ headers: new Map(origin ? [['origin', origin]] : []) });
    expect(sameOrigin(req('https://mutaafaziz.com'), url)).toBe(true);
    expect(sameOrigin(req('https://evil.example'), url)).toBe(false);
    expect(sameOrigin(req(null), url)).toBe(false);
  });
  it('quick race picks the fullest open room that is not about to start', () => {
    const now = 100000;
    const rooms = {
      A: { code: 'A', open: true, count: 1, autoAt: 0, at: now },
      B: { code: 'B', open: true, count: 3, autoAt: now + 1000, at: now },
      C: { code: 'C', open: true, count: 2, autoAt: now + 9000, at: now },
      D: { code: 'D', open: true, count: 6, at: now },
      E: { code: 'E', open: true, count: 5, at: now - 200000 },
    };
    expect(pickRoom(rooms, now).code).toBe('C');
    expect(pickRoom({}, now)).toBeNull();
  });
});
