// Zero-login identity (ticket 0090) against a real SQLite through the D1 wrapper.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleApi, resetSchemaCache } from '../../src/worker/scores.js';
import { verifyCred, credFor, normalizeCode, LINK, THROTTLE, COOKIE } from '../../src/worker/identity.js';
import { fakeD1 } from './fake-d1.js';

describe('credentials', () => {
  it('prove a public id and reject tampering', async () => {
    const cred = await credFor('abcdefghijkl', 'k1');
    expect(await verifyCred(cred, 'k1')).toBe('abcdefghijkl');
    expect(await verifyCred(cred, 'k2')).toBeNull();
    expect(await verifyCred(cred.replace('abcdefghijkl', 'abcdefghijkm'), 'k1')).toBeNull();
    expect(await verifyCred('abcdefghijkl', 'k1')).toBeNull();
    expect(await verifyCred(null, 'k1')).toBeNull();
  });
  it('normalise codes kids type', () => {
    expect(normalizeCode('ab3 d-ef', 6)).toBe('AB3DEF');
    expect(normalizeCode('AB0DEF', 6)).toBeNull(); // no zero in the alphabet
    expect(normalizeCode('ABCDE', 6)).toBeNull();
  });
});

describe('identity API', () => {
  let db, clock, ip;
  // A tiny browser: one cookie jar per "device".
  const device = () => ({ cookie: '' });
  const call = async (dev, method, path, body, headers = {}) => {
    const h = { 'content-type': 'application/json', ...headers };
    if (dev?.cookie) h.cookie = `${COOKIE}=${dev.cookie}`;
    const req = new Request(`https://mutaafaziz.com${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const res = await handleApi(req, { db, now: () => clock, ip });
    const set = res.headers.get('set-cookie');
    if (dev && set) dev.cookie = set.match(new RegExp(`${COOKIE}=([^;]*)`))[1];
    return { status: res.status, body: await res.json(), setCookie: set };
  };
  const postRun = async (dev, initials, score) => {
    const { token } = (await call(dev, 'POST', '/outatime/api/run')).body;
    clock += 61000;
    return call(dev, 'POST', '/outatime/api/scores', { token, initials, score, distance: 2000, durationMs: 60000, warps: 1, level: 0, mode: 'ARCADE' });
  };

  beforeEach(() => {
    resetSchemaCache();
    db = fakeD1();
    clock = Date.UTC(2026, 9, 17, 12);
    ip = '203.0.113.7';
  });

  it('issues a racer silently with a first-party HttpOnly cookie, and keeps it', async () => {
    const d = device();
    const first = await call(d, 'GET', '/outatime/api/me');
    expect(first.status).toBe(200);
    expect(first.body.fresh).toBe(true);
    expect(first.body.pub).toMatch(/^[a-z2-7]{12}$/);
    expect(first.setCookie).toMatch(/HttpOnly/);
    expect(first.setCookie).toMatch(/Secure/);
    expect(first.setCookie).toMatch(/SameSite=Lax/);
    expect(first.setCookie).toMatch(/Path=\/outatime\//);
    const again = await call(d, 'GET', '/outatime/api/me');
    expect(again.body.pub).toBe(first.body.pub);
    expect(again.body.fresh).toBe(false);
    // A drive-by visit writes nothing.
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n).toBe(0);
  });

  it('restores a lost cookie from the mirrored credential, and ignores a forged one', async () => {
    const d = device();
    const { pub, cred } = (await call(d, 'GET', '/outatime/api/me')).body;
    const wiped = device();
    const back = await call(wiped, 'GET', '/outatime/api/me', null, { 'x-ot-id': cred });
    expect(back.body.pub).toBe(pub);
    expect(wiped.cookie).toBe(cred);
    const forged = await call(device(), 'GET', '/outatime/api/me', null, { 'x-ot-id': `${pub}.AAAAAAAAAAAAAAAAAAAAAA` });
    expect(forged.body.pub).not.toBe(pub);
  });

  it('keeps a profile (initials, car, friends) and ties posted runs to the racer', async () => {
    const d = device();
    const { pub } = (await call(d, 'GET', '/outatime/api/me')).body;
    expect((await call(d, 'POST', '/outatime/api/me', { initials: 'cld', car: 'ARC_MK88' })).body.profile).toMatchObject({ initials: 'CLD', car: 'ARC_MK88' });
    expect((await call(d, 'POST', '/outatime/api/me', { initials: 'ASS' })).status).toBe(400);
    const friend = device();
    const fpub = (await call(friend, 'GET', '/outatime/api/me')).body.pub;
    await call(friend, 'POST', '/outatime/api/me', { initials: 'ZED' });
    const p = (await call(d, 'POST', '/outatime/api/me/friends', { add: [fpub, pub, 'nope'] })).body.profile;
    expect(p.friends).toEqual([{ pub: fpub, initials: 'ZED' }]);
    expect((await postRun(d, 'CLD', 300000)).status).toBe(200);
    const me = (await call(d, 'GET', '/outatime/api/me')).body;
    expect(me.bests).toEqual([{ mode: 'ARCADE', level: 0, best: 300000 }]);
    expect(db.raw.prepare('SELECT dev FROM scores').get().dev).toBe(pub);
  });

  it('links a second device with a single-use 10-minute code and merges its runs', async () => {
    const ipad = device();
    const phone = device();
    const a = (await call(ipad, 'GET', '/outatime/api/me')).body.pub;
    await call(ipad, 'POST', '/outatime/api/me', { initials: 'CLD' });
    const b = (await call(phone, 'GET', '/outatime/api/me')).body.pub;
    await postRun(phone, 'CLD', 500000);
    const { code, expiresAt } = (await call(ipad, 'POST', '/outatime/api/link')).body;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(expiresAt - clock).toBe(LINK.ttlMs);
    const r = await call(phone, 'POST', '/outatime/api/link/redeem', { code: code.toLowerCase() });
    expect(r.status).toBe(200);
    expect(r.body.pub).toBe(a);
    expect(r.body.merged).toBe(true);
    expect(r.body.bests[0].best).toBe(500000);
    expect((await call(phone, 'GET', '/outatime/api/me')).body.pub).toBe(a);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM profiles WHERE pub = ?').get(b).n).toBe(0);
    // Single use.
    expect((await call(device(), 'POST', '/outatime/api/link/redeem', { code })).status).toBe(404);
    // Expiry.
    const late = (await call(ipad, 'POST', '/outatime/api/link')).body.code;
    clock += LINK.ttlMs + 1;
    expect((await call(device(), 'POST', '/outatime/api/link/redeem', { code: late })).status).toBe(404);
  });

  it('recovers a racer from a written-down code; a new code replaces the old one', async () => {
    const d = device();
    const pub = (await call(d, 'GET', '/outatime/api/me')).body.pub;
    const old = (await call(d, 'POST', '/outatime/api/recovery')).body.code;
    const code = (await call(d, 'POST', '/outatime/api/recovery')).body.code;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await call(device(), 'POST', '/outatime/api/recovery/redeem', { code: old })).status).toBe(404);
    const fresh = device();
    const r = await call(fresh, 'POST', '/outatime/api/recovery/redeem', { code });
    expect(r.body.pub).toBe(pub);
    expect(fresh.cookie).toBe(r.body.cred);
  });

  it('switches racers on a shared device and forgets the device on request', async () => {
    const ipad = device();
    const kid1 = (await call(ipad, 'GET', '/outatime/api/me')).body;
    await call(ipad, 'POST', '/outatime/api/forget');
    expect(ipad.cookie).toBe('');
    const kid2 = (await call(ipad, 'GET', '/outatime/api/me')).body;
    expect(kid2.pub).not.toBe(kid1.pub);
    const back = await call(ipad, 'POST', '/outatime/api/use', { cred: kid1.cred });
    expect(back.body.pub).toBe(kid1.pub);
    expect((await call(ipad, 'GET', '/outatime/api/me')).body.pub).toBe(kid1.pub);
    expect((await call(ipad, 'POST', '/outatime/api/use', { cred: 'x.y' })).status).toBe(403);
  });

  it('throttles code guessing per address, and keeps no address data past the hour', async () => {
    for (let i = 0; i < THROTTLE.maxRedeems; i++) {
      expect((await call(device(), 'POST', '/outatime/api/link/redeem', { code: 'ABCDEF' })).status).toBe(404);
    }
    expect((await call(device(), 'POST', '/outatime/api/link/redeem', { code: 'ABCDEF' })).status).toBe(429);
    ip = '198.51.100.9';
    expect((await call(device(), 'POST', '/outatime/api/link/redeem', { code: 'ABCDEF' })).status).toBe(404);
    clock += THROTTLE.keepMs + 1;
    await call(device(), 'POST', '/outatime/api/link/redeem', { code: 'ABCDEF' });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM throttle').get().n).toBe(1);
    // Score rows drop their address hash once the rate-limit window has passed.
    const d = device();
    await call(d, 'GET', '/outatime/api/me');
    await postRun(d, 'CLD', 1000);
    clock += 11 * 60e3;
    await postRun(d, 'CLD', 2000);
    const hashes = db.raw.prepare('SELECT ip_hash FROM scores ORDER BY id').all().map((r) => r.ip_hash);
    expect(hashes[0]).toBe('');
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM throttle').all())).not.toContain('198.51.100.9');
  });

  it('needs a racer for profile writes and codes', async () => {
    expect((await call(device(), 'POST', '/outatime/api/me', { initials: 'CLD' })).status).toBe(401);
    expect((await call(device(), 'POST', '/outatime/api/link')).status).toBe(401);
  });
});

describe('profile data', () => {
  it('merges top-level keys, deletes with null, caps size, and survives a device link', async () => {
    resetSchemaCache();
    const db = fakeD1();
    let clock = Date.UTC(2026, 9, 17, 12);
    const jar = { a: '', b: '' };
    const call = async (who, method, path, body) => {
      const h = { 'content-type': 'application/json' };
      if (jar[who]) h.cookie = `${COOKIE}=${jar[who]}`;
      const res = await handleApi(new Request(`https://mutaafaziz.com${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), { db, now: () => clock, ip: '1.2.3.4' });
      const set = res.headers.get('set-cookie');
      if (set) jar[who] = set.match(/ot_id=([^;]*)/)[1];
      return { status: res.status, body: await res.json() };
    };
    await call('a', 'GET', '/outatime/api/me');
    await call('a', 'POST', '/outatime/api/me/data', { data: { garage: { v: 1, cars: ['A'] }, coins: 5 } });
    const d = (await call('a', 'POST', '/outatime/api/me/data', { data: { coins: 9, tmp: 1 } })).body.profile.data;
    expect(d).toEqual({ garage: { v: 1, cars: ['A'] }, coins: 9, tmp: 1 });
    expect((await call('a', 'POST', '/outatime/api/me/data', { data: { tmp: null } })).body.profile.data.tmp).toBeUndefined();
    expect((await call('a', 'POST', '/outatime/api/me/data', { data: { big: 'x'.repeat(5000) } })).status).toBeGreaterThanOrEqual(400);
    expect((await call('a', 'POST', '/outatime/api/me/data', { data: { 'bad key': 1 } })).status).toBe(400);
    expect((await call('a', 'POST', '/outatime/api/me/data', { data: [1] })).status).toBe(400);
    const { code } = (await call('a', 'POST', '/outatime/api/link')).body;
    await call('b', 'GET', '/outatime/api/me');
    await call('b', 'POST', '/outatime/api/me/data', { data: { onlyOnB: true, coins: 1 } });
    const merged = (await call('b', 'POST', '/outatime/api/link/redeem', { code })).body.profile.data;
    expect(merged).toEqual({ garage: { v: 1, cars: ['A'] }, coins: 9, onlyOnB: true });
    clock += 1;
  });
});
