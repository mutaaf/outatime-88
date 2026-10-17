// Makes sure wrangler dev (the second Playwright webServer) serves a complete, current dist/.
// Playwright normally starts it after the first server (build + preview) is up, so the build
// is done; if they ever start together, wait for dist/_headers, the build's last file, to be
// fresh (CI) or present (locally, where a reused preview server means no new build).
import { existsSync, statSync } from 'node:fs';

const started = Date.now();
const fresh = () => existsSync('dist/_headers') && (!process.env.CI || statSync('dist/_headers').mtimeMs > started - 10 * 60e3);
while (!fresh()) {
  if (Date.now() - started > 170e3) { console.error('build did not finish'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}
