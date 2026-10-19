// TV mode pairing (ticket 0175): who may join a code, and what the relay passes on.
import { describe, it, expect } from 'vitest';
import { PAD, KEY_RE, admit, fromPad, fromTv, padAllow, makeKey, sameKey, joinAllowed } from '../../src/worker/pad-core.js';

const KEY = 'f'.repeat(32);
const sess = { at: 1000, paired: false, key: KEY };

describe('pad pairing rules', () => {
  it('the TV may always (re)connect to a live code; nobody joins a code that was never made', () => {
    expect(admit('tv', sess, 1e9, { key: KEY })).toEqual({ ok: true, slot: -1 });
    expect(admit('tv', null, 0).error).toBe('NO_CODE');
    expect(admit('pad', null, 0, { tvOn: true }).error).toBe('NO_CODE');
    expect(admit('boss', sess, 0).error).toBe('BAD_ROLE');
  });
  it('phones need the TV on, a fresh code, and a free slot', () => {
    expect(admit('pad', sess, 2000).error).toBe('NO_TV');
    expect(admit('pad', sess, 2000, { tvOn: true })).toEqual({ ok: true, slot: 0 });
    expect(admit('pad', sess, 2000, { tvOn: true, slots: [0] }).slot).toBe(1);
    expect(admit('pad', sess, 2000, { tvOn: true, slots: [0, 1] }).error).toBe('FULL');
    expect(admit('pad', sess, 1000 + PAD.ttlMs + 1, { tvOn: true }).error).toBe('EXPIRED');
  });
  it('a paired session never expires for its phones, and a reconnect gets its old slot back', () => {
    const paired = { at: 1000, paired: true, key: KEY };
    expect(admit('pad', paired, 1000 + PAD.ttlMs * 9, { tvOn: true }).ok).toBe(true);
    expect(admit('pad', paired, 5000, { tvOn: true, want: 1 }).slot).toBe(1);
    expect(admit('pad', paired, 5000, { tvOn: true, slots: [1], want: 1 }).slot).toBe(0);
  });
});

describe('pad relay', () => {
  it('wraps pad frames with the slot and drops junk', () => {
    expect(JSON.parse(fromPad(1, '[0,5,-420,3]'))).toEqual({ t: 'm', s: 1, d: [0, 5, -420, 3] });
    expect(fromPad(0, 'not json')).toBeNull();
    expect(fromPad(0, 'x'.repeat(PAD.maxMsgBytes + 1))).toBeNull();
    expect(fromPad(0, new ArrayBuffer(4))).toBeNull();
  });
  it('routes TV frames to one pad or all of them', () => {
    expect(fromTv('{"to":1,"d":{"k":"sdp"}}')).toEqual({ to: 1, text: '{"t":"m","d":{"k":"sdp"}}' });
    expect(fromTv('{"to":"all","d":[1,2]}').to).toBe('all');
    for (const bad of ['{"to":7,"d":1}', '{"to":0}', 'nope', '{"to":"0","d":1}']) expect(fromTv(bad)).toBeNull();
  });
  it('rate-limits each socket', () => {
    const b = {};
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (padAllow(b, 5000)) ok++;
    expect(ok).toBe(PAD.rate.burst);
    expect(padAllow(b, 6000)).toBe(true); // refills over time
  });
});

describe('TV key and join throttle', () => {
  const key = 'a'.repeat(32);
  const keyed = { at: 1000, paired: false, key };
  it('mints 128-bit hex keys', () => {
    const k = makeKey();
    expect(k).toMatch(KEY_RE);
    expect(makeKey()).not.toBe(k);
  });
  it('the TV role needs the key minted with the code; phones need only the code', () => {
    expect(admit('tv', keyed, 2000, { key })).toEqual({ ok: true, slot: -1 });
    for (const bad of ['', 'b'.repeat(32), key.slice(1), `${key}0`, undefined]) expect(admit('tv', keyed, 2000, { key: bad }).error).toBe('BAD_KEY');
    expect(admit('tv', { at: 1000, paired: false }, 2000, { key: '' }).error).toBe('BAD_KEY'); // a session without a key can't have a TV
    expect(admit('pad', keyed, 2000, { tvOn: true }).ok).toBe(true);
  });
  it('compares keys without caring where they differ', () => {
    expect(sameKey(key, key)).toBe(true);
    expect(sameKey(key, `b${key.slice(1)}`)).toBe(false);
    expect(sameKey(key, `${key.slice(0, 31)}b`)).toBe(false);
    expect(sameKey('', key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
  it('throttles joins per IP for TVs and phones alike, per window', () => {
    const m = new Map();
    let ok = 0;
    for (let i = 0; i < 100; i++) if (joinAllowed(m, '1.2.3.4', 1000)) ok++;
    expect(ok).toBe(PAD.joinsPerMin);
    expect(joinAllowed(m, '5.6.7.8', 1000)).toBe(true); // another IP is unaffected
    expect(joinAllowed(m, '1.2.3.4', 1000 + 60e3 + 1)).toBe(true); // next window
  });
});
