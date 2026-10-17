// A real API backend for e2e: the Worker's own handlers over an in-memory SQLite, served
// through page.route. Pages that share one backend are like devices talking to one server.
import { handleApi, resetSchemaCache, ensureSchema } from '../../src/worker/scores.js';
import { fakeD1 } from '../unit/fake-d1.js';

export function createBackend() {
  resetSchemaCache();
  const db = fakeD1();
  let offset = 0;
  const now = () => Date.now() + offset;
  return {
    db,
    advance(ms) { offset += ms; },
    /** A run by someone else, straight into the table (no token dance). */
    seed(initials, score, { mode = 'ARCADE', level = 0, at = now(), dev = '' } = {}) {
      const day = new Date(at).toISOString().slice(0, 10);
      db.raw.prepare(`INSERT INTO scores (run_id, initials, score, distance, duration_ms, warps, level, mode, day, created_at, ip_hash, dev)
        VALUES (?, ?, ?, 1000, 60000, 0, ?, ?, ?, ?, '', ?)`).run(`seed-${Math.random()}`, initials, score, level, mode, day, at, dev);
    },
    /** Route this page's /outatime/api/* to the backend (call after watchPage so it wins). */
    async attach(page, ip = '203.0.113.7') {
      await ensureSchema(db); // so seed() can write before the page's first call
      await page.route('**/outatime/api/**', async (route) => {
        const req = route.request();
        const headers = await req.allHeaders();
        const body = ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined;
        const url = new URL(req.url());
        const res = await handleApi(
          new Request(`https://mutaafaziz.com${url.pathname}${url.search}`, { method: req.method(), headers, body }),
          { db, now, ip },
        );
        const out = {};
        res.headers.forEach((v, k) => { out[k] = v; });
        await route.fulfill({ status: res.status, headers: out, body: await res.text() });
      });
    },
  };
}
