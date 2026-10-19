// TV mode (ticket 0175): the PadRoom Durable Object pairs one TV screen with up to two phone
// pads under a 4-letter code, signals their WebRTC link and relays input when P2P can't
// connect. Hibernation API, so an idle pairing screen costs no duration. Storage: one key
// ({ at, paired }); frames are relayed from memory and never stored. Rules: pad-core.js.

import { DurableObject } from 'cloudflare:workers';
import { makeCode, cleanCode } from './live-rules.js';
import { PAD, KEY_RE, admit, fromPad, fromTv, padAllow, makeKey, joinAllowed } from './pad-core.js';
import { json } from './scores.js';
import { createAllowed, sameOrigin } from './live.js';

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
// Per-isolate throttles, separate from race rooms' so TV pairing never eats a room quota.
const minted = new Map(); // new codes per IP
const joins = new Map();  // WebSocket joins per IP, TV and phone (guessing codes)

export async function handlePad(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/outatime/api/pad' && !path.startsWith('/outatime/api/pad/')) return null;
  if (!env.PADS) return json(503, { error: 'tv mode offline' });
  const ip = request.headers.get('cf-connecting-ip') || '';

  if (path === '/outatime/api/pad') {
    if (request.method !== 'POST') return json(405, { error: 'POST only' });
    if (!createAllowed(ip, Date.now(), minted)) return json(429, { error: 'slow down' });
    for (let i = 0; i < 6; i++) {
      const code = makeCode(rand);
      const key = makeKey();
      const res = await env.PADS.get(env.PADS.idFromName(code)).fetch('https://pad/init', { method: 'POST', body: JSON.stringify({ key }) });
      if (res.ok) return json(200, { code, key, ttlMs: PAD.ttlMs });
    }
    return json(503, { error: 'busy' });
  }

  const code = cleanCode(path.slice('/outatime/api/pad/'.length));
  if (!code) return json(404, { error: 'no such code' });
  if (request.headers.get('upgrade') !== 'websocket') return json(426, { error: 'websocket only' });
  if (!sameOrigin(request, url)) return json(403, { error: 'bad origin' });
  // Every socket (TV or phone) counts against the per-IP join throttle: guessing codes is slow.
  if (!joinAllowed(joins, ip, Date.now())) return json(429, { error: 'slow down' });
  return env.PADS.get(env.PADS.idFromName(code)).fetch(request);
}

export class PadRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.buckets = new WeakMap();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    const sess = await this.ctx.storage.get('s');
    if (url.pathname === '/init' && request.method === 'POST') {
      if (sess && this.ctx.getWebSockets().length) return new Response('in use', { status: 409 });
      const body = await request.json().catch(() => ({}));
      if (!KEY_RE.test(body.key || '')) return new Response('bad key', { status: 400 });
      await this.ctx.storage.put('s', { at: now, paired: false, key: body.key });
      await this.ctx.storage.setAlarm(now + PAD.idleMs);
      return new Response('ok');
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const role = url.searchParams.get('role');
    const sockets = this.ctx.getWebSockets();
    const tv = sockets.filter((w) => w.deserializeAttachment()?.role === 'tv');
    const pads = sockets.filter((w) => w.deserializeAttachment()?.role === 'pad');
    const r = admit(role, sess, now, {
      tvOn: tv.length > 0,
      slots: pads.map((w) => w.deserializeAttachment().slot),
      want: Number(url.searchParams.get('slot') ?? -1),
      key: url.searchParams.get('key') || '',
    });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (r.error) {
      server.send(JSON.stringify({ t: 'err', code: r.error }));
      server.close(4004, r.error);
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ role, slot: r.slot });
    if (role === 'tv') {
      // A reconnecting TV replaces the old socket and tells the pads to re-link.
      for (const old of tv) { old.serializeAttachment({ role: 'gone', slot: -1 }); try { old.close(4000, 'replaced'); } catch { /* closing */ } }
      for (const p of pads) {
        server.send(JSON.stringify({ t: 'join', s: p.deserializeAttachment().slot }));
        try { p.send('{"t":"tv-back"}'); } catch { /* closing */ }
      }
    } else {
      if (!sess.paired) await this.ctx.storage.put('s', { ...sess, paired: true });
      server.send(JSON.stringify({ t: 'hi', s: r.slot, tv: true }));
      for (const t of tv) try { t.send(JSON.stringify({ t: 'join', s: r.slot })); } catch { /* closing */ }
    }
    await this.ctx.storage.setAlarm(now + PAD.idleMs);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    const att = ws.deserializeAttachment() || {};
    if (att.role !== 'tv' && att.role !== 'pad') return;
    let bucket = this.buckets.get(ws);
    if (!bucket) { bucket = {}; this.buckets.set(ws, bucket); }
    if (!padAllow(bucket, Date.now())) {
      bucket.strikes = (bucket.strikes || 0) + 1;
      if (bucket.strikes > 200) ws.close(4008, 'too many messages');
      return;
    }
    const sockets = this.ctx.getWebSockets();
    if (att.role === 'pad') {
      const text = fromPad(att.slot, data);
      if (!text) return;
      for (const w of sockets) if (w.deserializeAttachment()?.role === 'tv') try { w.send(text); } catch { /* closing */ }
      return;
    }
    const out = fromTv(data);
    if (!out) return;
    for (const w of sockets) {
      const a = w.deserializeAttachment();
      if (a?.role === 'pad' && (out.to === 'all' || out.to === a.slot)) try { w.send(out.text); } catch { /* closing */ }
    }
  }

  webSocketClose(ws) { this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const att = ws.deserializeAttachment() || {};
    ws.serializeAttachment({ role: 'gone', slot: -1 });
    const others = this.ctx.getWebSockets().filter((w) => w !== ws);
    if (att.role === 'pad') {
      for (const w of others) if (w.deserializeAttachment()?.role === 'tv') try { w.send(JSON.stringify({ t: 'leave', s: att.slot })); } catch { /* closing */ }
    } else if (att.role === 'tv') {
      for (const w of others) if (w.deserializeAttachment()?.role === 'pad') try { w.send('{"t":"tv-gone"}'); } catch { /* closing */ }
    }
  }

  async alarm() {
    const live = this.ctx.getWebSockets().filter((w) => ['tv', 'pad'].includes(w.deserializeAttachment()?.role));
    if (live.length) { await this.ctx.storage.setAlarm(Date.now() + PAD.idleMs); return; }
    await this.ctx.storage.deleteAll();
  }
}
