// OUTATIME 88 edge Worker (ticket 0024). Static assets are served by Workers Static Assets
// directly; only /outatime/api/* reaches this script (wrangler.jsonc → assets.run_worker_first),
// so the game's HTML keeps its _headers (no-transform, no injected analytics).
// Operator-owned (agents/control.json → frozen_paths).

import { handleApi } from './scores.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/outatime/api/')) {
      return handleApi(request, {
        db: env.DB,
        now: () => Date.now(),
        ip: request.headers.get('cf-connecting-ip') || '',
      });
    }
    return env.ASSETS.fetch(request);
  },
};
