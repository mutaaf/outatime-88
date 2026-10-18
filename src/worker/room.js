// RaceRoom Durable Object (sprint 3): one instance per 4-letter room code. Uses the WebSocket
// Hibernation API, so an idle lobby costs no duration; all rules live in room-core.js.
// Storage: one SQLite-backed key ('core') written on lobby changes only — the 10 Hz race
// frames are relayed from memory and never stored.

import { DurableObject } from 'cloudflare:workers';
import { RoomCore, allow } from './room-core.js';
import { LIVE } from './live-rules.js';
import { randomId } from './token.js';

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export class RaceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
    this.buckets = new WeakMap();
    this.reported = '';
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('core');
      if (saved) this.core = RoomCore.from(saved);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.core) return new Response('exists', { status: 409 });
      const body = await request.json().catch(() => ({}));
      this.core = new RoomCore({ code: body.code, isPublic: !!body.public, now: Date.now(), allowTest: this.env.LIVE_TEST === '1' });
      await this.persist();
      // A room nobody ever joins still gets wiped (the idle alarm).
      await this.ctx.storage.setAlarm(this.core.nextWake(Date.now()));
      return new Response('ok');
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    // The Worker (live.js) verified the racer's identity cookie and passed the public id; only
    // the Worker can reach this object, so the header is trusted here.
    server.serializeAttachment({ id: null, pub: request.headers.get('x-ot-racer') || null });
    if (!this.core) {
      server.send(JSON.stringify({ t: 'err', code: 'NO_ROOM' }));
      server.close(4004, 'no such room');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (!this.core || typeof data !== 'string' || data.length > LIVE.maxMsgBytes) return;
    const now = Date.now();
    let bucket = this.buckets.get(ws);
    if (!bucket) { bucket = {}; this.buckets.set(ws, bucket); }
    if (!allow(bucket, now)) {
      bucket.strikes = (bucket.strikes || 0) + 1;
      if (bucket.strikes > 60) ws.close(4008, 'too many messages');
      return;
    }
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const att = ws.deserializeAttachment() || {};
    const id = att.id;
    const core = this.core;

    if (m.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', c: Number(m.c) || 0, s: now }));
      return;
    }
    if (m.t === 's') {
      if (id) this.send(core.frame(id, m.d, now));
      return;
    }
    if (m.t === 'emo') {
      // Quick chat is relayed from memory like frames: no storage write, no alarm change.
      if (id) this.send(core.emote(id, Number(m.e), now));
      return;
    }

    let out = [];
    if (m.t === 'hello') {
      const r = core.join(m, now, randomId, att.pub || null);
      if (r.error) {
        ws.send(JSON.stringify({ t: 'err', code: r.error }));
        ws.close(4009, r.error);
        return;
      }
      // A reconnect replaces any older socket still open for the same seat.
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && other.deserializeAttachment()?.id === r.player.id) {
          other.serializeAttachment({ id: null, pub: null });
          try { other.close(4000, 'replaced'); } catch { /* already closing */ }
        }
      }
      ws.serializeAttachment({ id: r.player.id, pub: att.pub || null });
      out = r.out;
    } else if (!id) {
      return;
    } else if (m.t === 'set') out = core.set(id, m, now);
    else if (m.t === 'cfg') out = core.config(id, m, now);
    else if (m.t === 'start') out = core.start(id, now, rand);
    else if (m.t === 'fin') out = core.finish(id, Number(m.ms), Number(m.race), now);
    else return;

    this.send(out);
    await this.settle(now);
  }

  async webSocketClose(ws) { await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }

  async gone(ws) {
    if (!this.core) return;
    const id = ws.deserializeAttachment()?.id;
    if (!id) return;
    const stillHere = this.ctx.getWebSockets().some((o) => o !== ws && o.deserializeAttachment()?.id === id);
    if (stillHere) return;
    const now = Date.now();
    this.send(this.core.drop(id, now));
    await this.settle(now);
  }

  async alarm() {
    if (!this.core) return;
    const now = Date.now();
    this.send(this.core.tick(now, rand));
    if (this.core.idle(now)) {
      await this.report(true);
      this.core = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.settle(now);
  }

  send(out) {
    if (!out || !out.length) return;
    const sockets = this.ctx.getWebSockets();
    for (const { to, except, msg } of out) {
      const text = JSON.stringify(msg);
      for (const ws of sockets) {
        const id = ws.deserializeAttachment()?.id;
        if (!id || id === except || (to !== 'all' && to !== id)) continue;
        try { ws.send(text); } catch { /* closing */ }
      }
    }
  }

  async persist() {
    await this.ctx.storage.put('core', this.core.toJSON());
  }

  /** Persist, re-arm the alarm, and keep the quick-race index current. */
  async settle(now) {
    await this.persist();
    const wake = this.core.nextWake(now);
    if (wake) await this.ctx.storage.setAlarm(wake);
    await this.report(false);
  }

  async report(closed) {
    if (!this.core || !this.core.isPublic || !this.env.MATCH) return;
    const row = { code: this.core.code, open: !closed && this.core.open, count: this.core.players.length, autoAt: this.core.autoAt };
    const key = JSON.stringify(row);
    if (key === this.reported) return;
    this.reported = key;
    const stub = this.env.MATCH.get(this.env.MATCH.idFromName('global'));
    await stub.fetch('https://match/report', { method: 'POST', body: key }).catch(() => {});
  }
}
