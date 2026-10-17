// MatchIndex Durable Object (sprint 3): the one "global" instance that knows which public
// quick-race rooms still have seats. Rooms report themselves; /quick hands out the fullest
// open room (so strangers actually meet) or opens a fresh one.

import { DurableObject } from 'cloudflare:workers';
import { LIVE, makeCode } from './live-rules.js';

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const STALE_MS = 90e3;     // a room that hasn't reported for this long is forgotten
const CLOSING_MS = 2500;   // don't send people into a room that's about to go green

/** Pure pick, unit-tested: fullest open room with a seat, or null. */
export function pickRoom(rooms, now) {
  let best = null;
  for (const r of Object.values(rooms)) {
    if (!r.open || now - r.at > STALE_MS || r.count >= LIVE.maxPlayers) continue;
    if (r.autoAt && r.autoAt - now < CLOSING_MS) continue;
    if (!best || r.count > best.count) best = r;
  }
  return best;
}

export class MatchIndex extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = {};
    ctx.blockConcurrencyWhile(async () => {
      this.rooms = (await ctx.storage.get('rooms')) || {};
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    for (const [code, r] of Object.entries(this.rooms)) if (now - r.at > STALE_MS) delete this.rooms[code];

    if (url.pathname === '/report') {
      const r = await request.json().catch(() => null);
      if (!r || typeof r.code !== 'string') return new Response('bad', { status: 400 });
      if (r.open) this.rooms[r.code] = { code: r.code, open: true, count: r.count | 0, autoAt: r.autoAt || 0, at: now };
      else delete this.rooms[r.code];
      await this.ctx.storage.put('rooms', this.rooms);
      return new Response('ok');
    }

    if (url.pathname === '/quick') {
      const hit = pickRoom(this.rooms, now);
      if (hit) {
        hit.count += 1; // optimistic, until the room reports back
        await this.ctx.storage.put('rooms', this.rooms);
        return Response.json({ code: hit.code });
      }
      for (let i = 0; i < 6; i++) {
        const code = makeCode(rand);
        const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, public: true }) });
        if (res.ok) {
          this.rooms[code] = { code, open: true, count: 1, autoAt: 0, at: now };
          await this.ctx.storage.put('rooms', this.rooms);
          return Response.json({ code });
        }
      }
      return Response.json({ error: 'busy' }, { status: 503 });
    }
    return new Response('not found', { status: 404 });
  }
}
