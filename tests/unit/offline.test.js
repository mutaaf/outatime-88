// Offline play (ticket 0158): the precache list comes from the build, the leaderboard keeps the
// last board and an outbox of runs that lost their connection, the install hint picks the
// right words per platform, and ad totals wait for the network.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { precacheList, versionOf } from '../../scripts/precache.mjs';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

describe('precache list', () => {
  it('keeps every chunk, sound, latin font, icon and ad file; drops maps, legacy fonts and link-preview art', () => {
    const list = precacheList(
      ['assets/index-a.js', 'assets/view-b.js', 'assets/x.js.map', 'assets/coin-c.mp3', 'assets/engine-d.wav',
        'assets/inter-latin-400-normal-e.woff2', 'assets/inter-latin-400-normal-e.woff', 'assets/inter-cyrillic-400-normal-f.woff2',
        'assets/index-g.css', 'index.html', 'sw.js'],
      ['manifest.webmanifest', 'icons/icon-192.png', 'ads/manifest.json', 'ads/acme-16x9.png', 'og.jpg'],
    );
    expect(list).toEqual([
      'ads/acme-16x9.png', 'ads/manifest.json', 'assets/coin-c.mp3', 'assets/engine-d.wav', 'assets/index-a.js', 'assets/index-g.css',
      'assets/inter-latin-400-normal-e.woff2', 'assets/view-b.js', 'icons/icon-192.png', 'manifest.webmanifest',
    ]);
  });

  it('versions by content: same files → same id, any byte changed → new id', () => {
    const a = versionOf([['a.js', 'one'], ['b.json', '{}']]);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(versionOf([['a.js', 'one'], ['b.json', '{}']])).toBe(a);
    expect(versionOf([['a.js', 'one'], ['b.json', '{ }']])).not.toBe(a);
  });
});

const tokenAt = (t) => `${Buffer.from(JSON.stringify({ id: 'r', t })).toString('base64url')}.sig`;

describe('leaderboard offline', () => {
  let mod;
  let online;
  let fetchImpl;
  beforeEach(async () => {
    vi.resetModules();
    online = true;
    fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('navigator', { get onLine() { return online; } });
    vi.stubGlobal('fetch', (...a) => (online ? fetchImpl(...a) : Promise.reject(new TypeError('offline'))));
    mod = await import('../../src/board-offline.js');
  });

  it('reads the server time out of a run token', () => {
    expect(mod.tokenTime(tokenAt(1234))).toBe(1234);
    expect(mod.tokenTime('junk')).toBe(0);
  });

  it('shows the last board it saw, marked offline', async () => {
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ entries: [{ rank: 1, initials: 'ACE', score: 9 }] }), { status: 200 }));
    const live = await mod.fetchBoardCached('week', 'ARCADE', 10, {});
    expect(live.offline).toBeUndefined();
    online = false;
    const cached = await mod.fetchBoardCached('week', 'ARCADE', 10, {});
    expect(cached.offline).toBe(true);
    expect(cached.entries[0].initials).toBe('ACE');
    expect(await mod.fetchBoardCached('daily', 'DAILY', 10, {})).toBeNull(); // never seen
  });

  it('queues a run that lost its connection and posts it when the network is back', async () => {
    online = false;
    const run = { token: tokenAt(Date.now()), score: 5 };
    const r = await mod.submitRunQueued(run);
    expect(r.queued).toBe(true);
    expect(mod.outbox()).toHaveLength(1);
    expect(await mod.flushOutbox()).toBe(0); // still offline: kept
    expect(mod.outbox()).toHaveLength(1);
    online = true;
    expect(await mod.flushOutbox()).toBe(1);
    expect(mod.outbox()).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('drops queued runs whose token the server would no longer accept', async () => {
    online = false;
    await mod.submitRunQueued({ token: tokenAt(Date.now()), score: 5 });
    online = true;
    expect(await mod.flushOutbox(Date.now() + mod.TOKEN_LIFE_MS + 1)).toBe(0);
    expect(mod.outbox()).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never queues a run with no token or an expired one', async () => {
    online = false;
    expect((await mod.submitRunQueued({ score: 5 })).queued).toBeUndefined();
    expect((await mod.submitRunQueued({ token: tokenAt(Date.now() - 3 * 3600e3), score: 5 })).queued).toBeUndefined();
    expect(mod.outbox()).toHaveLength(0);
  });
});

describe('offline status', () => {
  it('labels saving progress, ready and playing offline', async () => {
    const { offlineLabel } = await import('../../src/offline.js');
    expect(offlineLabel({ supported: false })).toBe('');
    expect(offlineLabel({ supported: true, ready: false, done: 41, total: 82 })).toBe('⬇️ SAVING FOR OFFLINE 50%');
    expect(offlineLabel({ supported: true, ready: true, online: true })).toBe('✈️ READY FOR OFFLINE');
    expect(offlineLabel({ supported: true, ready: true, online: false })).toBe('✈️ PLAYING OFFLINE');
  });
});

describe('install hint', () => {
  it('iOS gets Add to Home Screen, Firefox gets keep-storage, installed apps get nothing', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { hintKind } = await import('../../src/offline-ui.js');
    expect(hintKind({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1' }, false)).toBe('ios');
    expect(hintKind({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1', maxTouchPoints: 5 }, false)).toBe('ios'); // iPadOS
    expect(hintKind({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' }, false)).toBe('firefox');
    expect(hintKind({ userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140 Safari/537.36', maxTouchPoints: 0 }, false)).toBeNull();
    expect(hintKind({ userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1' }, true)).toBeNull();
  });
});
