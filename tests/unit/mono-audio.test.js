// MONO AUDIO (ticket 0303): Settings → Sound → Output STEREO | MONO, saved as settings.mono
// ('mono'; STEREO deletes the key). MONO downmixes at the master gain, and the two cues that
// said "which side" by pan alone (proximity tick, lane guide) say it by tone instead.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeAudioContext } from './fake-audio.js';
import { monoOf } from '../../src/settings.js';
import { sideRate, createProximityCue } from '../../src/proximity-cue.js';
import { sideWave, GUIDE, createLaneGuide } from '../../src/lane-guide.js';

const KEY = 'outatime_cruisn_88_save_v2';
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
let created;
function stubBrowser(save) {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage(save ? { [KEY]: JSON.stringify(save) } : {}));
  created = [];
  vi.stubGlobal('window', {
    AudioContext: class extends FakeAudioContext { constructor() { super(); created.push(this); } },
    setInterval: () => 1, clearInterval: () => {}, addEventListener: () => {},
  });
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
}

describe('monoOf: unset or junk is STEREO', () => {
  it('only the exact value "mono" turns it on', () => {
    expect(monoOf(undefined)).toBe(false);
    expect(monoOf(null)).toBe(false);
    expect(monoOf({})).toBe(false);
    for (const junk of ['stereo', 'MONO', true, 1, 'yes', '', null]) expect(monoOf({ mono: junk })).toBe(false);
    expect(monoOf({ mono: 'mono' })).toBe(true);
  });
});

// Boot order as in main.js: the save loads, settings-ui's applyAll sets the output, a gesture inits audio.
async function boot() {
  const { SaveStore } = await import('../../src/save.js');
  const { SoundEngine } = await import('../../src/audio.js');
  SaveStore.load();
  SoundEngine.setMono(monoOf(SaveStore.data.settings));
  SoundEngine.init();
  return { SoundEngine, SaveStore };
}

describe('SoundEngine output (0303)', () => {
  beforeEach(() => stubBrowser(null));

  it('a fresh or old save stays stereo: master gain left at the Web Audio defaults', async () => {
    stubBrowser({ initials: 'OLD', settings: { musicVolume: 0.5 } });
    const { SoundEngine } = await boot();
    expect(SoundEngine.mono).toBe(false);
    const m = SoundEngine.masterGain;
    expect(m.channelCount ?? 2).toBe(2);
    expect(m.channelCountMode ?? 'max').toBe('max');
  });

  it('a saved MONO downmixes at the master from the first sound', async () => {
    stubBrowser({ initials: 'CLD', settings: { mono: 'mono' } });
    const { SoundEngine } = await boot();
    const m = SoundEngine.masterGain;
    expect(m.channelCount).toBe(1);
    expect(m.channelCountMode).toBe('explicit');
    expect(m.channelInterpretation).toBe('speakers'); // sums L+R, drops nothing
  });

  it('switches live on the same context (no restart), both ways, and before init', async () => {
    const { SoundEngine } = await import('../../src/audio.js');
    SoundEngine.setMono(true); // no context yet: remembered, applied at init
    SoundEngine.init();
    const ctx = created[0];
    expect(SoundEngine.masterGain.channelCount).toBe(1);
    SoundEngine.setMono(false);
    expect(SoundEngine.masterGain.channelCount).toBe(2);
    expect(SoundEngine.masterGain.channelCountMode).toBe('max');
    SoundEngine.setMono(true);
    expect(SoundEngine.masterGain.channelCount).toBe(1);
    expect(created).toHaveLength(1);
    expect(SoundEngine.ctx).toBe(ctx);
    expect(SoundEngine.masterGain.outputs).toEqual([ctx.destination]);
  });
});

describe('cue side by tone in MONO', () => {
  it('proximity tick: lower to the left, higher to the right, a clear interval apart; stereo unchanged', () => {
    expect(sideRate(0, true)).toBe(1);
    expect(sideRate(-1, true)).toBeLessThan(0.8);
    expect(sideRate(1, true)).toBeGreaterThan(1.25);
    expect(sideRate(1, true) / sideRate(-1, true)).toBeGreaterThan(1.7); // over a sixth apart
    for (const p of [-1, 0, 1]) expect(sideRate(p, false)).toBe(1);
  });

  it('lane guide: a different waveform per side in MONO; a sine in stereo', () => {
    const waves = [-1, 0, 1].map((p) => sideWave(p, true));
    expect(new Set(waves).size).toBe(3);
    expect(sideWave(-1, true)).not.toBe(sideWave(1, true));
    for (const p of [-1, 0, 1]) expect(sideWave(p, false)).toBe('sine');
  });

  // The fixtures of the cue tests: you at z 1000, 100 world units/s.
  const me = (x = 0) => ({ x, z: 1000, vz: 100, halfW: 0.14, halfL: 105, bot: 0, top: 34, now: 10 });
  const car = (offset, secs) => ({ worldZ: 1000 + 105 + 100 + secs * 100, offset, halfW: 0.12, halfL: 100, vz: 0, y: 0, height: 38 });
  const engine = (mono) => { const ctx = new FakeAudioContext(); return { ctx, sfxBus: ctx.createGain(), muted: false, volume: 0.8, mono }; };

  it('the proximity tick plays its side as pitch and centred in MONO', () => {
    const se = engine(true);
    const cue = createProximityCue(se, () => true);
    expect(cue.step(1 / 120, me(), [car(0.2, 0.4)], [])).toBe(1);
    const right = se.ctx.started[0].node;
    expect(right.playbackRate.value).toBeCloseTo(sideRate(1, true));
    const panner = se.ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner.pan.value).toBe(0); // full level in both ears, not the -3 dB of a hard pan
    for (let i = 0; i < 60; i++) cue.step(1 / 120, me(), [car(-0.2, 0.4)], []);
    const left = se.ctx.started[se.ctx.started.length - 1].node;
    expect(left.playbackRate.value).toBeCloseTo(sideRate(-1, true));
    // Stereo: today's tick, panned, at its own pitch.
    const st = engine(false);
    createProximityCue(st, () => true).step(1 / 120, me(), [car(0.2, 0.4)], []);
    expect(st.ctx.started[0].node.playbackRate.value).toBe(1);
    expect(st.ctx.nodes.find((n) => n.kind === 'panner').pan.value).toBeGreaterThan(0);
  });

  it('the lane guide changes waveform with the side in MONO, on the one oscillator, centred', () => {
    const [, , C] = GUIDE.lanes;
    const se = engine(true);
    const guide = createLaneGuide(se, () => true);
    expect(guide.step(1 / 120, me(), [car(0.05, 0.6)], [])).toBe(-1);
    const osc = se.ctx.started[0].node;
    expect(osc.type).toBe(sideWave(-1, true));
    const panner = se.ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner.pan.value).toBe(0);
    for (let i = 0; i < 12; i++) guide.step(1 / 120, me(), [car(-0.05, 0.6)], []);
    expect(osc.type).toBe(sideWave(1, true));
    expect(se.ctx.started).toHaveLength(1);
    // Turned back to stereo mid-guide: a sine again, panned.
    se.mono = false;
    for (let i = 0; i < 12; i++) guide.step(1 / 120, me(C), [car(-0.05, 0.6)], []);
    expect(osc.type).toBe('sine');
    expect(panner.pan.value).toBeGreaterThan(0);
  });
});
