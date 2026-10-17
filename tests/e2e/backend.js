// A real API backend for e2e: the Worker's own handlers over an in-memory SQLite, served
// through page.route. Pages that share one backend are like devices talking to one server.
import { handleApi, resetSchemaCache } from '../../src/worker/scores.js';
import { fakeD1 } from '../unit/fake-d1.js';

export function createBackend() {
  resetSchemaCache();
  const db = fakeD1();
  let clock = Date.now();
  return {
    db,
    advance(ms) { clock += ms; },
    /** Route this page's /outatime/api/* to the backend (call after watchPage so it wins). */
    async attach(page, ip = '203.0.113.7') {
      await page.route('**/outatime/api/**', async (route) => {
        const req = route.request();
        const headers = await req.allHeaders();
        const body = ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined;
        const url = new URL(req.url());
        const res = await handleApi(
          new Request(`https://mutaafaziz.com${url.pathname}${url.search}`, { method: req.method(), headers, body }),
          { db, now: () => clock, ip },
        );
        const out = {};
        res.headers.forEach((v, k) => { out[k] = v; });
        await route.fulfill({ status: res.status, headers: out, body: await res.text() });
      });
    },
  };
}
