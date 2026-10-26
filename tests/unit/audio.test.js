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
    setInterval: () => 1, clearInterval: () => {}, addEventListener: () => {},
  });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
});

const reachesDestination = (ctx, node, seen = new Set()) => {
  if (node === ctx.destination) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return node.outputs.some((o) => reachesDestination(ctx, o, seen));
};

describe('SoundEngine graph (ticket 0006)', () => {
  it('routes music, sfx and engine buses through one compressor and a limiter into master → destination', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    const ctx = created[0];
    const { musicBus, sfxBus, engineBus, compressor, limiter, masterGain } = SoundEngine;
    for (const bus of [musicBus, sfxBus, engineBus]) expect(bus.outputs).toEqual([compressor]);
    expect(compressor.kind).toBe('compressor');
    expect(compressor.outputs).toEqual([limiter]);
    expect(limiter.kind).toBe('compressor');
    expect(limiter.ratio.value).toBeGreaterThanOrEqual(12);
    expect(limiter.outputs).toEqual([masterGain]);
    expect(masterGain.outputs).toEqual([ctx.destination]);
  });

  it('the scores play through the mood filter and the ducker into the music bus (0193)', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    const score = await import('../../src/street-score.js');
    const music = await import('../../src/music.js');
    SoundEngine.init();
    score.createMusic(SoundEngine, { status: 'TITLE', eraIndex: 0 }, music);
    const { musicIn, musicLP, musicDuck, musicBus } = SoundEngine;
    expect(musicIn.outputs).toEqual([musicLP]);
    expect(musicLP.type).toBe('lowpass');
    expect(musicLP.outputs).toEqual([musicDuck]);
    expect(musicDuck.outputs).toEqual([musicBus]);
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

describe('sound wakes after an interruption (ticket 0212)', () => {
  // A window and document that record their listeners, so the test can fire them.
  let on, doc;
  const fire = (type) => (on[type] || []).forEach((f) => f({ type }));
  beforeEach(() => {
    on = {};
    doc = { hidden: false };
    const listen = (type, f) => { (on[type] ||= []).push(f); };
    doc.addEventListener = listen;
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', {
      AudioContext: class extends FakeAudioContext { constructor() { super(); created.push(this); } },
      setInterval: () => 1, clearInterval: () => {},
      addEventListener: listen,
    });
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  for (const asleep of ['suspended', 'interrupted']) {
    for (const wake of ['visibilitychange', 'pointerdown', 'keydown']) {
      it(`an un-muted player's ${asleep} context runs again on ${wake}`, async () => {
        const { SoundEngine } = await import('../../src/audio.js');
        SoundEngine.init();
        const ctx = created[0];
        ctx.state = asleep;
        fire(wake);
        await flush();
        expect(ctx.state).toBe('running');
      });
    }
  }

  it('the context waking itself up (statechange) is resumed, but not while the tab is hidden', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    const ctx = created[0];
    doc.hidden = true;
    fire('visibilitychange'); // hiding the tab puts it to sleep (0032)
    expect(ctx.state).toBe('suspended');
    ctx.onstatechange?.();
    await flush();
    expect(ctx.state).toBe('suspended'); // a hidden tab sleeps on purpose (0032)
    fire('visibilitychange'); // still hidden: nothing
    expect(ctx.state).toBe('suspended');
    doc.hidden = false;
    ctx.state = 'interrupted';
    ctx.onstatechange();
    await flush();
    expect(ctx.state).toBe('running');
  });

  it('a muted player stays muted: no event resumes the context', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init();
    const ctx = created[0];
    SoundEngine.setMuted(true);
    expect(ctx.state).toBe('suspended');
    for (const s of ['suspended', 'interrupted']) {
      ctx.state = s;
      for (const w of ['visibilitychange', 'pointerdown', 'keydown']) fire(w);
      ctx.onstatechange?.();
      await flush();
      expect(ctx.state).toBe(s);
    }
    SoundEngine.setMuted(false);
    expect(ctx.state).toBe('running'); // un-muting still wakes it, interrupted included
  });

  it('a closed context, a rejected resume or no context at all never throws', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    expect(() => SoundEngine.wake()).not.toThrow(); // title before the first gesture
    SoundEngine.init();
    const ctx = created[0];
    ctx.state = 'closed';
    const resume = vi.spyOn(ctx, 'resume');
    fire('pointerdown');
    expect(resume).not.toHaveBeenCalled();
    ctx.state = 'interrupted';
    ctx.resume = () => Promise.reject(new Error('InvalidStateError'));
    expect(() => fire('pointerdown')).not.toThrow();
    await flush();
  });

  it('listens once, however many times init() runs', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.init(); SoundEngine.init(); SoundEngine.init();
    expect(on.pointerdown).toHaveLength(1);
    expect(on.keydown).toHaveLength(1);
  });
});
