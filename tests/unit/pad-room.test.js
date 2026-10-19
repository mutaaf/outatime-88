// TV mode pairing (ticket 0175): who may join a code, and what the relay passes on.
import { describe, it, expect } from 'vitest';
import { PAD, admit, fromPad, fromTv, padAllow } from '../../src/worker/pad-core.js';

const sess = { at: 1000, paired: false };

describe('pad pairing rules', () => {
  it('the TV may always (re)connect to a live code; nobody joins a code that was never made', () => {
    expect(admit('tv', sess, 1e9)).toEqual({ ok: true, slot: -1 });
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
    const paired = { at: 1000, paired: true };
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
