// OUTATIME 88 edge Worker (ticket 0024). Static assets are served by Workers Static Assets
// directly; only /outatime/api/* reaches this script (wrangler.jsonc → assets.run_worker_first),
// so the game's HTML keeps its _headers (no-transform, no injected analytics).
// Operator-owned (agents/control.json → frozen_paths).
//
//   /outatime/api/run, /scores      leaderboard (scores.js, D1)
//   POST /outatime/api/room         new private room → { code }           (live.js)
//   POST /outatime/api/quick        a public quick-race room → { code }
//   GET  /outatime/api/room/<CODE>  WebSocket into that room (RaceRoom Durable Object)

import { handleApi } from './scores.js';
import { handleLive } from './live.js';

export { RaceRoom } from './room.js';
export { MatchIndex } from './match.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/outatime/api/')) {
      const live = await handleLive(request, env, url);
      if (live) return live;
      return handleApi(request, {
        db: env.DB,
        now: () => Date.now(),
        ip: request.headers.get('cf-connecting-ip') || '',
      });
    }
    return env.ASSETS.fetch(request);
  },
};
