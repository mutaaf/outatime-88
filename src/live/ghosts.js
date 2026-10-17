// Remote racers (sprint 3): each friend's car arrives as ~10 Hz snapshots. We draw it ~100 ms
// in the past, interpolating between the two snapshots around that moment, and briefly
// extrapolate on its own speed when a packet is late — so cars glide instead of teleporting.
// Pure: the caller passes clock times, so this is unit-tested without a network.

export const GHOST = {
  delayMs: 110,      // render this far behind the newest data (≈ one packet + jitter)
  maxExtrapMs: 350,  // after that, hold position rather than guess
  keep: 10,          // snapshots kept per racer
};

/** unitsPerMph: world units per second at 1 mph (depends on the live pace). */
export function createGhostTrack(unitsPerMph) {
  const buf = []; // { t, z, x, y, mph, f }
  return {
    get size() { return buf.length; },
    get last() { return buf[buf.length - 1] || null; },
    clear() { buf.length = 0; },
    /** d = [z, x*1000, y, mph, flags] as sent on the wire; t = local receive time (ms). */
    push(t, d) {
      const last = buf[buf.length - 1];
      if (last && t <= last.t) t = last.t + 1;
      // Out-of-order or stale z (e.g. a knock-back) is fine: we only ever draw what was sent.
      const s = buf.length >= GHOST.keep ? buf.shift() : {};
      s.t = t; s.z = d[0]; s.x = d[1] / 1000; s.y = d[2]; s.mph = d[3]; s.f = d[4];
      buf.push(s);
    },
    /** Writes the drawn state at local time `now` into `out` ({ z, x, y, mph, f }). False if empty. */
    sample(now, out) {
      if (!buf.length) return false;
      const t = now - GHOST.delayMs;
      const first = buf[0];
      if (t <= first.t) { copy(out, first); return true; }
      for (let i = buf.length - 1; i > 0; i--) {
        const a = buf[i - 1], b = buf[i];
        if (t >= a.t && t <= b.t) {
          const k = (t - a.t) / Math.max(1, b.t - a.t);
          out.z = a.z + (b.z - a.z) * k;
          out.x = a.x + (b.x - a.x) * k;
          out.y = a.y + (b.y - a.y) * k;
          out.mph = a.mph + (b.mph - a.mph) * k;
          out.f = b.f;
          return true;
        }
      }
      const last = buf[buf.length - 1];
      copy(out, last);
      const ahead = Math.min(GHOST.maxExtrapMs, t - last.t);
      out.z = last.z + (last.mph * unitsPerMph * ahead) / 1000;
      return true;
    },
  };
}

function copy(out, s) {
  out.z = s.z; out.x = s.x; out.y = s.y; out.mph = s.mph; out.f = s.f;
}

/**
 * Clock sync from ping/pong: offset = serverTime - localTime, estimated from the round trip
 * with the lowest latency (least queuing noise) among recent samples.
 */
export function createClockSync(keep = 8) {
  const samples = [];
  return {
    get offset() {
      if (!samples.length) return 0;
      let best = samples[0];
      for (const s of samples) if (s.rtt < best.rtt) best = s;
      return best.offset;
    },
    get rtt() { return samples.length ? Math.min(...samples.map((s) => s.rtt)) : 0; },
    get count() { return samples.length; },
    /** sentAt and recvAt are local ms; serverAt is the server's clock when it answered. */
    add(sentAt, serverAt, recvAt) {
      const rtt = Math.max(0, recvAt - sentAt);
      samples.push({ rtt, offset: serverAt + rtt / 2 - recvAt });
      if (samples.length > keep) samples.shift();
    },
  };
}
