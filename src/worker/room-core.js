// Live room state machine (sprint 3). Pure and synchronous: the Durable Object (room.js) feeds
// it events with the current time and executes the messages it returns, so every rule here is
// unit-testable without a Worker runtime.
//
//   LOBBY ──host START / all ready / quick-race timer──▶ COUNTDOWN ──startAt──▶ RACING
//     ▲                                                                         │
//     └────────────── RESULTS ◀── everyone finished / grace / cap ─────────────┘
//   RESULTS behaves like LOBBY (ready up for a rematch, host can start), it just shows results.
//
// Messages out: { to: 'all' | <playerId>, except?: <playerId>, msg }

import { LIVE, LENGTHS, CPU_NAMES, cleanConfig, cpuProfile, cpuFinishMs, cpuZ, rankResults, cleanFrame, acceptFinish } from './live-rules.js';
import { cleanInitials } from './initials.js';

const LOBBYISH = new Set(['LOBBY', 'RESULTS']);

export class RoomCore {
  constructor({ code, isPublic = false, now, allowTest = false }) {
    this.code = code;
    this.isPublic = !!isPublic;
    this.allowTest = !!allowTest;
    this.state = 'LOBBY';
    this.cfg = { level: 0, len: 0 };
    this.players = [];        // join order; { id, key, name, car, ready, conn, spectate, joinedAt, goneAt, wins, z (race progress), ms }
    this.hostId = null;
    this.seed = 0;
    this.startAt = 0;
    this.endAt = 0;           // hard deadline for the current race (server clock)
    this.autoAt = 0;          // scheduled auto start (all ready / quick race)
    this.results = null;
    this.race = 0;            // race counter, so stale finishes can't leak into the next race
    this.cpus = [];
    this.lastActive = now;
  }

  static from(json) {
    const r = new RoomCore({ code: json.code, isPublic: json.isPublic, now: json.lastActive });
    Object.assign(r, json);
    return r;
  }

  toJSON() {
    const { code, isPublic, allowTest, state, cfg, players, hostId, seed, startAt, endAt, autoAt, results, race, cpus, lastActive } = this;
    return { code, isPublic, allowTest, state, cfg, players, hostId, seed, startAt, endAt, autoAt, results, race, cpus, lastActive };
  }

  get connected() { return this.players.filter((p) => p.conn); }
  get racers() { return this.players.filter((p) => p.racer); }
  find(id) { return this.players.find((p) => p.id === id) || null; }

  /** What every client renders: no keys, nothing personal. */
  snapshot(now) {
    return {
      t: 'room', code: this.code, public: this.isPublic, state: this.state, cfg: this.cfg,
      host: this.hostId, seed: this.seed, startAt: this.startAt, endAt: this.endAt, autoAt: this.autoAt, race: this.race,
      now,
      players: this.players.map((p) => ({
        id: p.id, pub: p.pub || null, name: p.name, car: p.car, ready: !!p.ready, conn: !!p.conn,
        spectate: !!p.spectate, racer: !!p.racer, slot: p.slot ?? -1, wins: p.wins || 0,
        done: p.ms != null,
      })),
      cpus: this.cpus,
      results: this.results,
    };
  }

  broadcast(now) { return [{ to: 'all', msg: this.snapshot(now) }]; }

  /**
   * hello: { id?, key?, name, car }. `pub` is the racer's verified public id (identity cookie,
   * checked by the Worker) or null. The same racer — or a matching seat id+key when there's no
   * identity — reclaims their seat (reconnect, reload, second tab).
   * Returns { out, player } or { error }.
   */
  join(hello, now, mint, pub = null) {
    this.lastActive = now;
    const byPub = pub ? this.players.find((p) => p.pub === pub) : null;
    const byKey = hello && hello.id ? this.find(hello.id) : null;
    const back = byPub || (byKey && byKey.key === hello.key ? byKey : null);
    if (back) {
      back.conn = true;
      back.goneAt = 0;
      if (!this.hostId || !this.find(this.hostId)?.conn) this.hostId = back.id;
      return { player: back, out: [{ to: back.id, msg: { t: 'welcome', id: back.id, key: back.key } }, ...this.broadcast(now)] };
    }
    if (this.players.length >= LIVE.maxPlayers) {
      this.sweep(now, true);
      if (this.players.length >= LIVE.maxPlayers) return { error: 'FULL' };
    }
    const p = {
      id: mint(9), key: mint(12), pub: pub || null,
      name: this.uniqueName(cleanInitials(hello && hello.name) || 'RCR', null),
      car: carOf(hello && hello.car),
      ready: false, conn: true, spectate: !LOBBYISH.has(this.state), racer: false,
      joinedAt: now, goneAt: 0, wins: 0, z: 0, ms: null,
    };
    this.players.push(p);
    if (!this.hostId || !this.find(this.hostId)?.conn) this.hostId = p.id;
    if (this.isPublic && LOBBYISH.has(this.state) && !this.autoAt) this.autoAt = now + LIVE.publicWaitMs;
    this.cancelAutoIfNotAllReady();
    return { player: p, out: [{ to: p.id, msg: { t: 'welcome', id: p.id, key: p.key } }, ...this.broadcast(now)] };
  }

  /** Socket closed. The seat is kept for a while so a reconnect slides straight back in. */
  drop(id, now) {
    const p = this.find(id);
    if (!p || !p.conn) return [];
    p.conn = false;
    p.goneAt = now;
    if (this.hostId === id) {
      const next = this.players.find((q) => q.conn);
      this.hostId = next ? next.id : id;
    }
    this.cancelAutoIfNotAllReady();
    const out = this.maybeFinishRace(now);
    return out.length ? out : this.broadcast(now);
  }

  /** Lobby edits: initials, car, ready. */
  set(id, patch, now) {
    const p = this.find(id);
    if (!p || !patch || typeof patch !== 'object') return [];
    this.lastActive = now;
    if ('name' in patch) { const n = cleanInitials(patch.name); if (n) p.name = this.uniqueName(n, p.id); }
    if ('car' in patch) p.car = carOf(patch.car);
    if ('ready' in patch && LOBBYISH.has(this.state)) p.ready = !!patch.ready;
    const eligible = this.connected.filter((q) => !q.spectate);
    if (LOBBYISH.has(this.state) && eligible.length >= 2 && eligible.every((q) => q.ready)) {
      const at = now + LIVE.autoStartMs;
      if (!this.autoAt || this.autoAt > at) this.autoAt = at;
    } else {
      this.cancelAutoIfNotAllReady();
    }
    return this.broadcast(now);
  }

  config(id, cfg, now) {
    if (id !== this.hostId || !LOBBYISH.has(this.state)) return [];
    this.cfg = cleanConfig(cfg, this.cfg, this.allowTest);
    this.lastActive = now;
    return this.broadcast(now);
  }

  /** Host START: anyone in the lobby races (CPU cars fill the grid, so 1 player is a real race too). */
  start(id, now, rand) {
    if (id !== this.hostId || !LOBBYISH.has(this.state)) return [];
    return this.beginCountdown(now, now + LIVE.countdownMs, rand);
  }

  beginCountdown(now, startAt, rand) {
    const field = this.connected;
    if (!field.length) return [];
    this.state = 'COUNTDOWN';
    this.race += 1;
    this.seed = (Math.floor(rand() * 0x7fffffff) | 1) >>> 0;
    this.startAt = startAt;
    this.endAt = startAt + LENGTHS[this.cfg.len].capMs;
    this.autoAt = 0;
    this.results = null;
    let slot = 0;
    for (const p of this.players) {
      p.racer = p.conn;
      p.spectate = false;
      p.ready = false;
      p.z = 0;
      p.ms = null;
      p.slot = p.racer ? slot++ : -1;
    }
    this.cpus = [];
    // CPU names never repeat or clash with a human's initials.
    const taken = new Set(this.players.filter((p) => p.racer).map((p) => p.name));
    for (let k = 0; slot < LIVE.grid; k++, slot++) {
      const prof = cpuProfile(this.seed, k);
      let name = prof.name;
      for (let i = 0; taken.has(name) && i < CPU_NAMES.length; i++) name = CPU_NAMES[(CPU_NAMES.indexOf(prof.name) + i + 1) % CPU_NAMES.length];
      taken.add(name);
      this.cpus.push({ slot, k, name, car: prof.car });
    }
    this.lastActive = now;
    return this.broadcast(now);
  }

  /** Relays a racer's state frame to everyone else. Never persisted (it's 10 Hz). */
  frame(id, d, now) {
    if (this.state !== 'RACING' && this.state !== 'COUNTDOWN') return [];
    const p = this.find(id);
    if (!p || !p.racer || p.ms != null) return [];
    const clean = cleanFrame(d, now - this.startAt);
    if (!clean) return [];
    p.z = clean[0];
    return [{ to: 'all', except: id, msg: { t: 'p', s: p.slot, d: clean } }];
  }

  /**
   * Quick chat (friends 10x): a preset emote 1–7 from a connected player, relayed to everyone
   * else. Never free text, never persisted; at most one a second per player. Mid-race emotes
   * ride the state frame's flags instead (src/live/emotes.js), so this is for lobby / results.
   */
  emote(id, e, now) {
    const p = this.find(id);
    if (!p || !p.conn || !Number.isInteger(e) || e < 1 || e > LIVE.emotes) return [];
    if (now - (p.emoAt || 0) < LIVE.emoteGapMs) return [];
    p.emoAt = now;
    return [{ to: 'all', except: id, msg: { t: 'emo', id, e } }];
  }

  finish(id, ms, race, now) {
    if (this.state !== 'RACING' || race !== this.race) return [];
    const p = this.find(id);
    if (!p || !p.racer || p.ms != null) return [];
    const dist = LENGTHS[this.cfg.len].dist;
    if (p.z < dist * 0.9) return []; // you have to have actually driven there
    p.ms = acceptFinish(ms, now - this.startAt, dist);
    p.z = dist;
    this.lastActive = now;
    this.endAt = Math.min(this.endAt, now + LIVE.finishGraceMs);
    const out = this.maybeFinishRace(now);
    return out.length ? out : this.broadcast(now);
  }

  maybeFinishRace(now) {
    if (this.state !== 'RACING') return [];
    const live = this.racers.filter((p) => p.conn);
    if (live.length && live.every((p) => p.ms != null)) return this.endRace(now);
    if (!live.length) return this.endRace(now);
    return [];
  }

  endRace(now) {
    const elapsed = Math.max(0, now - this.startAt);
    const dist = LENGTHS[this.cfg.len].dist;
    const entrants = [];
    for (const p of this.racers) entrants.push({ id: p.id, name: p.name, car: p.car, cpu: false, ms: p.ms, z: p.z, slot: p.slot });
    for (const c of this.cpus) {
      const prof = cpuProfile(this.seed, c.k);
      const ms = cpuFinishMs(prof, dist);
      entrants.push({ id: 'cpu' + c.slot, name: c.name, car: c.car, cpu: true, ms: ms <= elapsed ? ms : null, z: Math.min(dist, Math.round(cpuZ(prof, elapsed / 1000))), slot: c.slot });
    }
    this.results = rankResults(entrants);
    const winner = this.results[0];
    if (winner && !winner.cpu) { const w = this.find(winner.id); if (w) w.wins = (w.wins || 0) + 1; }
    this.state = 'RESULTS';
    // Quick race rolls straight into the next one; private rooms wait for READY / START.
    this.autoAt = this.isPublic ? now + LIVE.publicWaitMs + 5000 : 0;
    for (const p of this.players) { p.ready = false; p.spectate = false; }
    this.lastActive = now;
    return this.broadcast(now);
  }

  /** Timers: green light, race deadline, auto starts, dropping long-gone players. */
  tick(now, rand) {
    let out = [];
    if (this.state === 'COUNTDOWN' && now >= this.startAt) {
      this.state = 'RACING';
      out = this.broadcast(now);
    }
    if (this.state === 'RACING' && now >= this.endAt) out = this.endRace(now);
    if (LOBBYISH.has(this.state) && this.autoAt && now >= this.autoAt) {
      out = this.beginCountdown(now, now + LIVE.countdownMs, rand);
    }
    if (this.sweep(now) && !out.length) out = this.broadcast(now);
    return out;
  }

  /** Removes seats whose owner has been gone too long (only between races). */
  sweep(now, force = false) {
    if (!LOBBYISH.has(this.state)) return false;
    const before = this.players.length;
    this.players = this.players.filter((p) => p.conn || (!force && now - p.goneAt < LIVE.dropMs));
    if (this.players.length !== before) {
      if (!this.find(this.hostId)) this.hostId = this.players[0]?.id || null;
      if (!this.players.length) this.autoAt = 0;
      return true;
    }
    return false;
  }

  cancelAutoIfNotAllReady() {
    if (this.isPublic && LOBBYISH.has(this.state)) return; // the quick-race timer runs regardless
    const eligible = this.connected.filter((q) => !q.spectate);
    if (!(eligible.length >= 2 && eligible.every((q) => q.ready))) this.autoAt = 0;
  }

  /** Two ZAPs in one room is confusing: the newcomer becomes ZAQ, ZAR… (still filtered). */
  uniqueName(name, selfId) {
    const taken = (n) => this.players.some((q) => q.id !== selfId && q.name === n);
    if (!taken(name)) return name;
    for (let i = 1; i < 26; i++) {
      const n = name.slice(0, 2) + String.fromCharCode(65 + ((name.charCodeAt(2) - 65 + i) % 26));
      if (!taken(n) && cleanInitials(n)) return n;
    }
    return name;
  }

  /** Next time tick() has something to do (for the DO alarm), or 0. */
  nextWake(now) {
    const ts = [];
    if (this.state === 'COUNTDOWN') ts.push(this.startAt);
    if (this.state === 'RACING') ts.push(this.endAt);
    if (this.autoAt) ts.push(this.autoAt);
    for (const p of this.players) if (!p.conn) ts.push(p.goneAt + LIVE.dropMs);
    if (!this.connected.length) ts.push(this.lastActive + LIVE.idleMs);
    const next = ts.filter((t) => t > 0).sort((a, b) => a - b)[0];
    return next ? Math.max(next, now + 50) : 0;
  }

  idle(now) { return !this.connected.length && now - this.lastActive >= LIVE.idleMs; }

  /** Quick race: can a stranger still get a seat in the next race? */
  get open() {
    return this.isPublic && LOBBYISH.has(this.state) && this.players.length < LIVE.maxPlayers;
  }
}

function carOf(v) {
  return Number.isInteger(v) && v >= 0 && v < 64 ? v : 0;
}

/** Per-socket token bucket. Returns false when the socket is over its budget. */
export function allow(bucket, now, { perSec, burst } = LIVE.rate) {
  const elapsed = Math.max(0, now - (bucket.at || now)) / 1000;
  bucket.tokens = Math.min(burst, (bucket.tokens ?? burst) + elapsed * perSec);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
