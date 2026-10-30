// Race specials (0227): the takedown, ZONE / AGRO / ROAR and the pulse beam, driven through the
// new module with main.js and race-step.js stood in by fakes (the real ones need a page).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const calls = [];
  const log = (name) => (...a) => { calls.push([name, ...a]); };
  const GameState = {};
  const SaveStore = { data: {}, save: log('save') };
  const SoundEngine = {
    init: log('init'), playTakedown: log('playTakedown'), playAbilityZone: log('playAbilityZone'),
    playBoosterHit: log('playBoosterHit'), playAbilityRoar: log('playAbilityRoar')
  };
  const segs = new Map();
  const track = { seg: (i) => segs.get(i) || null };
  const LiveTraffic = { racers: [], traffic: [] };
  return { calls, log, GameState, SaveStore, SoundEngine, segs, track, LiveTraffic };
});

vi.mock('../../src/main.js', () => ({
  RACE_DEPS: {
    FLUX: { gains: { takedown: 32 } },
    GameState: h.GameState,
    ROAD_CFG: { segLength: 200, playerZOffset: 0 },
    SaveStore: h.SaveStore,
    SoundEngine: h.SoundEngine,
    track: h.track
  },
  JarvisAI: { setStatus: h.log('status') },
  LiveTraffic: h.LiveTraffic,
  advanceContractProgress: h.log('contract'),
  burstSparks: h.log('sparks'),
  triggerAnnouncement: h.log('announce')
}));
vi.mock('../../src/race-step.js', () => ({
  RF: { updateLiveHud: h.log('hud') },
  earnCash: (n) => n,
  spawnParticle: h.log('particle')
}));

const sp = await import('../../src/race-specials.js');
const { GameState, SaveStore, calls, segs, LiveTraffic } = h;
const called = (name) => calls.filter((c) => c[0] === name);

class FakeEl { constructor() { this.className = ''; this.style = { opacity: '' }; } }
let tint;

beforeEach(() => {
  calls.length = 0;
  segs.clear();
  LiveTraffic.racers = [];
  LiveTraffic.traffic = [];
  tint = new FakeEl();
  globalThis.document = { getElementById: (id) => (id === 'abilityTintOverlay' ? tint : null) };
  Object.assign(GameState, {
    takedowns: 0, combo: 1, comboTimer: 0, fluxCharge: 0, heatProgress: 0, heatLevel: 1,
    score: 0, runCoins: 0, screenShake: 0, takedownSlowMoTimer: 0, reducedMotion: false,
    playerX: 0, flyingWrecks: [], hitShockwaves: [], debrisShards: [], carJoltY: 0,
    specialCharges: 0, zoneTimer: 0, agroTimer: 0, speed: 60, trackPos: 0, roarWaveZ: -1,
    unibeamTimer: 0
  });
  SaveStore.data = { fluxCoins: 0, upgrades: { flux: 1 } };
});

const car = (over) => ({ name: 'VEX', offset: 0.3, worldZ: 1000, type: 'RIVAL', takenDown: false, ...over });

describe('triggerRivalTakedown', () => {
  it('wrecks the car once and pays combo, flux, heat, points and cash', () => {
    GameState.combo = 3;
    GameState.heatProgress = 80;
    const c = car();
    sp.triggerRivalTakedown(c, 'TEST SLAM');
    expect(c.takenDown).toBe(true);
    expect(GameState.takedowns).toBe(1);
    expect(GameState.combo).toBe(5);
    expect(GameState.comboTimer).toBe(5.5);
    expect(GameState.fluxCharge).toBe(32);
    expect(GameState.heatLevel).toBe(2); // 80 + 35 crosses 100
    expect(GameState.heatProgress).toBe(0);
    expect(GameState.score).toBe(10000); // 2000 × combo 5
    expect(GameState.runCoins).toBe(15);
    expect(SaveStore.data.fluxCoins).toBe(15);
    expect(GameState.takedownSlowMoTimer).toBe(0.35);
    expect(GameState.flyingWrecks).toHaveLength(1);
    expect(GameState.hitShockwaves[0]).toMatchObject({ label: '💥 TAKEDOWN! +2000', hit: true });
    expect(GameState.debrisShards).toHaveLength(16);
    expect(called('particle')).toHaveLength(22);
    expect(called('announce')[0][1]).toBe('💥 TEST SLAM 💥');
    expect(called('contract')[0]).toEqual(['contract', 'TAKEDOWN', 1]);
    expect(called('save')).toHaveLength(1);

    sp.triggerRivalTakedown(c);
    expect(GameState.takedowns).toBe(1); // already wrecked: nothing again
  });

  it('calm motion skips the slow-mo; combo and flux are capped', () => {
    Object.assign(GameState, { reducedMotion: true, combo: 11, fluxCharge: 90 });
    sp.triggerRivalTakedown(car());
    expect(GameState.takedownSlowMoTimer).toBe(0);
    expect(GameState.combo).toBe(12);
    expect(GameState.fluxCharge).toBe(100);
  });
});

describe('activateMidnightSpecial', () => {
  it('refuses without a charge or 35% flux', () => {
    GameState.fluxCharge = 34;
    sp.activateMidnightSpecial('ZONE');
    expect(GameState.zoneTimer).toBe(0);
    expect(called('announce')[0][1]).toBe('NEED MORE FLUX OR SPECIAL!');
  });

  it('ZONE spends a charge first, shows the tint and the fade clears it once', () => {
    GameState.specialCharges = 1;
    GameState.fluxCharge = 50;
    sp.activateMidnightSpecial('ZONE');
    expect(GameState.specialCharges).toBe(0);
    expect(GameState.fluxCharge).toBe(50);
    expect(GameState.zoneTimer).toBe(4.5);
    expect(tint.className).toContain('bg-emerald-500/10');
    expect(tint.style.opacity).toBe('');
    expect(called('hud')).toHaveLength(1);

    sp.fadeAbilityTint(); // still running: untouched
    expect(tint.style.opacity).toBe('');
    GameState.zoneTimer = 0;
    sp.fadeAbilityTint();
    expect(tint.style.opacity).toBe('0');
    tint.style.opacity = 'x';
    sp.fadeAbilityTint(); // written once, not every step
    expect(tint.style.opacity).toBe('x');
  });

  it('AGRO spends 35% flux, surges speed and shows the calm tint under reduced motion', () => {
    Object.assign(GameState, { fluxCharge: 40, speed: 60, reducedMotion: true });
    SaveStore.data.upgrades.flux = 3;
    sp.activateMidnightSpecial('AGRO');
    expect(GameState.fluxCharge).toBe(5);
    expect(GameState.agroTimer).toBeCloseTo(6.2);
    expect(GameState.speed).toBe(95);
    expect(tint.className).toContain('bg-orange-600/10');
    expect(tint.style.opacity).toBe('0.5');
  });

  it('ROAR takes down every car in the next 18 segments', () => {
    GameState.specialCharges = 1;
    GameState.trackPos = 400; // segment 2
    const a = car({ name: 'A' }), b = car({ name: 'B' }), far = car({ name: 'FAR' }), done = car({ takenDown: true });
    segs.set(2, { cars: [a, done] });
    segs.set(19, { cars: [b] });
    segs.set(20, { cars: [far] });
    sp.activateMidnightSpecial('ROAR');
    expect([a.takenDown, b.takenDown, far.takenDown]).toEqual([true, true, false]);
    expect(GameState.takedowns).toBe(2);
    expect(GameState.roarWaveZ).toBe(0);
    expect(GameState.speed).toBe(60); // a wreck, so no surge
  });

  it('ROAR on an empty road is a turbo surge instead', () => {
    GameState.specialCharges = 1;
    sp.activateMidnightSpecial('ROAR');
    expect(GameState.speed).toBe(92);
    expect(called('announce')[0][1]).toBe('🟣 1.88 GW ROAR SHOCKWAVE!');
  });
});

describe('fireUnibeam', () => {
  it('needs 18% flux', () => {
    GameState.fluxCharge = 17;
    sp.fireUnibeam();
    expect(GameState.unibeamTimer).toBe(0);
    expect(called('status')).toHaveLength(1);
  });

  it('takes down the nearest car in range ahead', () => {
    GameState.fluxCharge = 30;
    const near = car({ name: 'NEAR', worldZ: 900 }), farther = car({ name: 'FAR', worldZ: 2000 });
    const tooClose = car({ worldZ: 100 }), behind = car({ worldZ: -500 }), outOfRange = car({ worldZ: 5000 });
    LiveTraffic.racers = [farther, tooClose];
    LiveTraffic.traffic = [behind, near, outOfRange];
    sp.fireUnibeam();
    expect(GameState.fluxCharge).toBe(12 + 32); // spent 18, the takedown pays it back
    expect(GameState.unibeamTimer).toBe(0.42);
    expect(near.takenDown).toBe(true);
    expect(farther.takenDown || tooClose.takenDown || outOfRange.takenDown).toBe(false);
  });

  it('with nothing in range it boosts speed, capped at 135', () => {
    GameState.fluxCharge = 30;
    GameState.speed = 130;
    sp.fireUnibeam();
    expect(GameState.speed).toBe(135);
    expect(called('announce')[0][1]).toBe('💠 ARC PULSE BEAM FIRED!');
  });
});
