import { describe, it, expect } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';
import { createBank, SAMPLE_URLS, MAX_VOICES, engineMix, engineRates, screechVoice } from '../../src/sfx/bank.js';

class DecodingCtx extends FakeAudioContext {
  decodeAudioData(ab) { return Promise.resolve({ duration: 2, length: ab.byteLength, tag: ab.tag }); }
}
const okFetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(Object.assign(new ArrayBuffer(4), {})) });
const bus = (ctx) => ctx.createGain();

describe('sample bank (ticket 0133)', () => {
  it('loads every sample and plays them through the sfx bus', async () => {
    const ctx = new DecodingCtx();
    const sfx = bus(ctx);
    const bank = await createBank(ctx, { sfx, engine: bus(ctx), fetch: okFetch }).load();
    expect(bank.ready).toBe(true);
    expect(bank.loaded).toBe(Object.keys(SAMPLE_URLS).length);
    expect(bank.play('coin')).toBe(true);
    expect(bank.voices.every((v) => v.g.outputs[0] === sfx)).toBe(true);
  });

  it('falls back (play returns false) when fetches fail, and never rejects', async () => {
    const ctx = new DecodingCtx();
    const bank = await createBank(ctx, { sfx: bus(ctx), engine: bus(ctx), fetch: () => Promise.reject(new Error('offline')) }).load();
    expect(bank.ready).toBe(false);
    expect(bank.failed).toBe(Object.keys(SAMPLE_URLS).length);
    expect(bank.play('crash')).toBe(false);
    expect(bank.engine({ rpm: 50, gear: 3, playing: true })).toBe(false);
  });

  it('treats a 404 as a miss for that sample only', async () => {
    const ctx = new DecodingCtx();
    const f = (u) => (u === SAMPLE_URLS.horn ? Promise.resolve({ ok: false }) : okFetch());
    const bank = await createBank(ctx, { sfx: bus(ctx), engine: bus(ctx), fetch: f }).load();
    expect(bank.has('horn')).toBe(false);
    expect(bank.has('crash')).toBe(true);
  });

  it('caps simultaneous voices by stealing the oldest', async () => {
    const ctx = new DecodingCtx();
    const bank = await createBank(ctx, { sfx: bus(ctx), engine: bus(ctx), fetch: okFetch }).load();
    for (let i = 0; i < MAX_VOICES * 3; i++) { ctx.currentTime = i; expect(bank.play('bump')).toBe(true); }
    expect(bank.voices.length).toBe(MAX_VOICES);
    expect(bank.voices.every((v) => v.src)).toBe(true);
  });

  it('builds the squeal only when the tyres first squeal, with no sample files needed', () => {
    const ctx = new DecodingCtx();
    const bank = createBank(ctx, { sfx: bus(ctx), engine: bus(ctx), fetch: okFetch });
    const before = ctx.nodes.length;
    expect(bank.tyres(0, 0)).toBe(0);
    expect(ctx.nodes.length).toBe(before);
    expect(bank.tyres(0.8, 0)).toBeGreaterThan(0);
    expect(ctx.nodes.length).toBeGreaterThan(before);
    const after = ctx.nodes.length;
    for (let i = 0; i < 50; i++) bank.tyres(i % 2 ? 0.9 : 0.3, 0.5);
    expect(ctx.nodes.length).toBe(after); // steady state: params only, no new nodes
  });
});

describe('engine and squeal mapping', () => {
  it('crossfades low → high loop as revs rise, at constant power', () => {
    const lo = engineMix(0), hi = engineMix(1);
    expect(lo.lo).toBeCloseTo(1); expect(lo.hi).toBeCloseTo(0);
    expect(hi.lo).toBeCloseTo(0); expect(hi.hi).toBeCloseTo(1);
    const mid = engineMix(0.55);
    expect(mid.lo ** 2 + mid.hi ** 2).toBeCloseTo(1);
  });
  it('pitches up with rpm and gear, and per car voice', () => {
    const a = engineRates(20, 1), b = engineRates(90, 1), c = engineRates(90, 5);
    expect(b.lo).toBeGreaterThan(a.lo);
    expect(c.hi).toBeGreaterThan(b.hi);
    expect(engineRates(60, 3, 0.7).lo).toBeLessThan(engineRates(60, 3, 1).lo);
  });
  it('squeal gets louder and higher with the level, silent at zero', () => {
    expect(screechVoice(0).gain).toBe(0);
    expect(screechVoice(1).gain).toBeGreaterThan(screechVoice(0.3).gain);
    expect(screechVoice(1).pitch).toBeGreaterThan(screechVoice(0.3).pitch);
  });
});
