import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

let created;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  created = [];
  vi.stubGlobal('window', {
    AudioContext: class extends FakeAudioContext { constructor() { super(); created.push(this); } },
    setInterval: () => 1, clearInterval: () => {},
  });
});

const reachesDestination = (ctx, node, seen = new Set()) => {
  if (node === ctx.destination) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return node.outputs.some((o) => reachesDestination(ctx, o, seen));
};

describe('SoundEngine graph (ticket 0006)', () => {
  it('routes music, sfx and engine buses through one compressor into master → destination', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    const ctx = created[0];
    const { musicBus, sfxBus, engineBus, compressor, masterGain } = SoundEngine;
    for (const bus of [musicBus, sfxBus, engineBus]) expect(bus.outputs).toEqual([compressor]);
    expect(compressor.kind).toBe('compressor');
    expect(compressor.outputs).toEqual([masterGain]);
    expect(masterGain.outputs).toEqual([ctx.destination]);
  });

  it('one-shot SFX land on the sfx bus, not straight on master', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    const before = SoundEngine.masterGain.outputs.length;
    SoundEngine.playCoinPickup();
    const ctx = created[0];
    const gains = ctx.nodes.filter((n) => n.kind === 'gain' && n.outputs.includes(SoundEngine.sfxBus));
    expect(gains.length).toBeGreaterThan(0);
    expect(SoundEngine.masterGain.outputs.length).toBe(before);
    for (const g of gains) expect(reachesDestination(ctx, g)).toBe(true);
  });

  it('engine pitch rises with speed', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    SoundEngine.updateEngine(20, true);
    const low = SoundEngine.engineOsc.frequency.value;
    SoundEngine.updateEngine(110, true);
    expect(SoundEngine.engineOsc.frequency.value).toBeGreaterThan(low);
  });

  it('mute still persists to the save (existing behaviour)', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    const { SaveStore } = await import('../../src/save.js');
    SoundEngine.init();
    SoundEngine.setMuted(true);
    expect(JSON.parse(localStorage.getItem(SaveStore.key)).muted).toBe(true);
  });

  it('does not throw when Web Audio is unavailable (autoplay-blocked / old browser)', async () => {
    vi.stubGlobal('window', {});
    const { SoundEngine } = await import('../../src/audio.js');
    expect(() => { SoundEngine.init(); SoundEngine.playCrash(); SoundEngine.updateEngine(50, true); SoundEngine.startMusicLoop(); }).not.toThrow();
  });
});
