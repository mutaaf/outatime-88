// Shared e2e helpers: console-error capture, external-request guard, canvas sampling.
export const APP = '/outatime/';

/** Default leaderboard API stub: vite preview has no Worker, and a 404 would log an error.
 *  Tests that care about the API register their own page.route afterwards (it wins). */
export function stubApi(page) {
  return page.route('**/outatime/api/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body;
    if (url.pathname.endsWith('/run')) body = { token: 'test-token' };
    else if (req.method() === 'GET') body = { board: 'all', mode: 'ARCADE', day: '2026-10-17', entries: [] };
    else body = { ok: true, rank: { all: 1, daily: 1 } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

export function watchPage(page) {
  const problems = [];
  stubApi(page);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) {
      problems.push(`external request: ${r.url()}`);
    }
  });
  return problems;
}

/** Fraction of sampled pixels on #gameCanvas that are not near-black. */
export function canvasLitFraction(page) {
  return page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let lit = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      n++;
      if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
    }
    return lit / n;
  });
}

export const hudNumber = (page, id) =>
  page.locator(`#${id}`).innerText().then((t) => parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);
