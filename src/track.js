// Track generation: the endless road, built a biome at a time. No rendering here.
//
// The road is a fixed-size ring of pooled segment objects (endless-track ticket): segments keep
// their absolute index and track Z forever, but only the newest RING of them exist. Building a
// new segment reuses the object (and its points, items and item objects) of the one RING
// indices behind it, so a race or a title screen left running for hours allocates nothing and
// never grows. Read segments with `track.seg(i)` (null outside the live window) and the end of
// the road with `track.end`; `track.start` is the oldest live index.
import { ROAD_CFG } from './data.js';
import { GameState } from './state.js';
import { placePickup } from './pickups.js';
import { SETPIECE, loopLength, loopEntryMph, makeFeature } from './setpieces.js';

/**
 * Ring capacity in segments (a power of two). The game builds at most ~330 segments ahead of
 * the player (draw distance + lookahead + one biome) and looks back ~20, so a 1024 ring keeps
 * hundreds of segments of margin behind the camera before any slot is reused.
 */
export const RING = 1024;
const MASK = RING - 1;

export const track = {
  ring: new Array(RING).fill(null),
  start: 0,          // oldest live absolute index
  end: 0,            // one past the newest (the old `segments.length`)
  generatedCount: 0,
  line: null,
  seed: 0,           // shuffle-bag seed (0: the level's own fixed layout)
  power: 0,          // runner power-up spawn level (0177): the Endless tier, 0 = none
  run: {},           // replaced on every reset; renderers compare it to know the road restarted
  bag: [], bagPos: 0, bagCount: 0, lastPiece: '',
  allocated: 0,      // segment objects ever created (bounded by RING: proves the pool works)
  /** The segment with absolute index `i`, or null if it is not (or no longer) built. */
  seg(i) {
    return i >= this.start && i < this.end ? this.ring[i & MASK] : null;
  },
  /** The live window as a fresh array, oldest first. Allocates: tests and ?debug only. */
  liveSegments() {
    const out = [];
    for (let i = this.start; i < this.end; i++) out.push(this.ring[i & MASK]);
    return out;
  },
  /**
   * Debug/e2e helper: the first set piece of `kind` with road behind it to run up from,
   * building up to `maxBiomes` more biomes to reach one.
   */
  findFeature(kind, maxBiomes = 14) {
    for (let n = 0; ; n++) {
      for (let i = this.start; i < this.end; i++) {
        const f = this.ring[i & MASK].feature;
        if (f && f.kind === kind && f.z0 >= (this.start + 48) * ROAD_CFG.segLength) return f;
      }
      if (n >= maxBiomes) return null;
      generateNextTrackBiome();
    }
  },
};

/** The race's racing line (src/cleanline.js): hazards are never placed on it. */
export function setTrackLine(line) {
  track.line = line;
}

/**
 * Seed the layout shuffle (live rooms and dailies pass their shared seed so everyone races
 * the same road; 0 gives every level one fixed layout, fair for its leaderboard).
 */
export function setTrackSeed(seed) {
  track.seed = seed | 0;
}

/**
 * Curve amplitude multiplier on top of the level's (Endless Highway tiers, ticket 0150).
 * Applied to biomes generated from now on; seeded races (live, daily) keep 1.
 */
export function setTrackIntensity(k) {
  track.intensity = k > 0 ? k : 1;
}

/** Runner power-ups on the road from now on (src/pickups.js powerupAt): Endless tier, 0 = off. */
export function setTrackPowerups(level) {
  track.power = level > 0 ? level | 0 : 0;
}

export function resetTrack() {
  // The pooled objects stay in the ring; they are simply reused from index 0 again.
  track.start = 0;
  track.end = 0;
  track.generatedCount = 0;
  track.run = {};
  track.bag.length = 0;
  track.bagPos = 0;
  track.bagCount = 0;
}

export function buildInitialTrack() {
  resetTrack();
  for (let i = 0; i < 6; i++) {
    generateNextTrackBiome();
  }
}

function newSegment() {
  track.allocated++;
  return {
    index: 0,
    p1: { world: { x: 0, y: 0, z: 0 }, camera: {}, screen: {} },
    p2: { world: { x: 0, y: 0, z: 0 }, camera: {}, screen: {} },
    curve: 0, bank: 0, trackType: 'STANDARD', forkInfo: null,
    feature: null, // a set piece covering this segment (see featureAt), shared by its segments
    items: [], itemPool: [], cars: [],
    flameLeft: false, flameRight: false, flameOffset: 0, cpClaimed: false,
  };
}

export function addSegment(curve, y, bank, trackType, forkInfo = null) {
  const idx = track.end;
  const slot = idx & MASK;
  let seg = track.ring[slot];
  if (!seg) track.ring[slot] = seg = newSegment();
  const prev = idx === track.start ? null : track.ring[(idx - 1) & MASK];
  seg.index = idx;
  seg.p1.world.x = 0; seg.p1.world.y = prev ? prev.p2.world.y : 0; seg.p1.world.z = idx * ROAD_CFG.segLength;
  seg.p2.world.x = 0; seg.p2.world.y = y; seg.p2.world.z = (idx + 1) * ROAD_CFG.segLength;
  seg.curve = curve;
  seg.bank = bank;
  seg.trackType = trackType;
  seg.forkInfo = forkInfo;
  seg.feature = null;
  seg.items.length = 0;
  seg.cars.length = 0;
  seg.flameLeft = false; seg.flameRight = false; seg.flameOffset = 0; seg.cpClaimed = false;
  track.end = idx + 1;
  if (track.end - track.start > RING) track.start = track.end - RING;
}

/** Put an item on a segment, reusing that segment slot's pooled item objects. */
export function addItem(seg, offset, type, collectible = false, phase = 0) {
  const n = seg.items.length;
  let it = seg.itemPool[n];
  if (!it) { it = { offset: 0, type: '', collected: undefined, phase: 0 }; seg.itemPool[n] = it; }
  it.offset = offset;
  it.type = type;
  it.collected = collectible ? false : undefined;
  it.phase = phase;
  it.vOff = 0; // a magnet's pull speed (src/pickups.js), cleared for the pooled item's next use
  seg.items.push(it);
  return it;
}

/**
 * A billboard: an ad slot of its own (docs/ADS.md; art and rotation in src/billboard-art.js).
 * `slot` is stable for a given road (absolute segment index × 4 + `k`), so every racer on the
 * same seed sees the same board in the same place. Pooled like every other item.
 */
export function addBoard(seg, offset, kind, k) {
  const it = addItem(seg, offset, 'BILLBOARD');
  it.kind = kind;
  it.slot = seg.index * 4 + k;
  it.cid = '';
  it.mv = -1;
  it.bh = 0; // last faded for something behind it (0203); a pooled item starts solid
  return it;
}

const lastY = () => (track.end > track.start ? track.ring[(track.end - 1) & MASK].p2.world.y : 0);

export function addRoadSection(enter, hold, leave, curve, yDelta, bank, trackType = 'STANDARD', forkInfo = null) {
  const startY = lastY();
  const endY = startY + yDelta;
  const total = enter + hold + leave;
  for (let n = 0; n < enter; n++) {
    const t = n / enter;
    const ease = t * t * (3 - 2 * t);
    addSegment(curve * ease, startY + (endY - startY) * (n / total), bank * ease, trackType, forkInfo);
  }
  for (let n = 0; n < hold; n++) {
    addSegment(curve, startY + (endY - startY) * ((enter + n) / total), bank, trackType, forkInfo);
  }
  for (let n = 0; n < leave; n++) {
    const t = 1 - n / leave;
    const ease = t * t * (3 - 2 * t);
    addSegment(curve * ease, startY + (endY - startY) * ((enter + hold + n) / total), bank * ease, trackType, forkInfo);
  }
}

export function populateChunkDecorations(startIdx, endIdx, patternType) {
  for (let i = startIdx; i < endIdx; i++) {
    const seg = track.seg(i);
    if (!seg) continue;
    // Set pieces stay clean: no lamps on a loop, no coins over a gap (booster gates keep theirs).
    if ((seg.feature && seg.feature.kind !== 'BOOSTER') || seg.trackType === 'JUMP_RAMP') continue;

    // Night-Street Smoke Flares on Checkpoints & Forks
    if (seg.trackType === 'CHECKPOINT' && i === startIdx + 2) {
      addItem(seg, -1.15, 'MC_FLARE_GREEN');
      addItem(seg, 1.15, 'MC_FLARE_GREEN');
    }

    // Billboards (docs/ADS.md): the start arch, a gantry over every checkpoint, a banner on
    // the run-up to a loop and a sign at the other booster gates. All off the road or overhead.
    if (patternType === 'OPENING' && i === startIdx + 14) addBoard(seg, 0, 'START_ARCH', 1);
    if (seg.trackType === 'CHECKPOINT' && i === startIdx + 1) addBoard(seg, 0, 'GANTRY', 1);
    const gate = seg.feature && seg.feature.kind === 'BOOSTER' && seg.feature.z0 === i * L() ? seg.feature : null;
    if (gate) addBoard(seg, -1.72, gate.lead === 'LOOP' ? 'LOOP_BANNER' : 'GATE_SIGN', 2);

    // Roadside Streetlamps, Billboards & Orange-Track Arches
    if (i % 6 === 0) {
      const propTypes = ['STREET_LAMP', 'BILLBOARD', 'PALM_TREE', 'CLOCK_TOWER_BILLBOARD', 'ARCH_HW'];
      const pType = propTypes[(i / 6) % propTypes.length | 0];
      if (pType === 'BILLBOARD') {
        // One big roadside board, alternating sides, with a lamp across the road.
        const side = ((i / 30) | 0) % 2 ? 1 : -1;
        addBoard(seg, 1.58 * side, 'ROADSIDE', 0);
        addItem(seg, -1.42 * side, 'STREET_LAMP');
      } else {
        addItem(seg, -1.42, pType);
        addItem(seg, 1.42, pType);
      }
    }

    // Overhead Loop & Tunnel Rings
    if ((seg.trackType === 'LOOP' || seg.trackType === 'BOOSTER') && i % 3 === 0) {
      addItem(seg, 0, 'OVERHEAD_GATE');
    }

    // Pickups (src/pickups.js): coin trails, flux cores, wrenches and NOS on the clean line.
    if (seg.trackType !== 'CHECKPOINT') placePickup(seg, i, patternType, track.line, addItem, track.power, track.seed);
  }
}

// ---------------------------------------------------------------------------------------
// Orange-track layouts. The endless road cycles a shuffle bag of every piece: all six curve
// shapes (sweeper, S-bends, hairpin, crest, chicane, double-apex banked 180) and all four
// set pieces (loop, corkscrew, gap jump, wall-ride half-pipe), each set piece led in by a
// booster gate. A bag is used up before the next is drawn, so every curve and every set piece
// comes round again every ten pieces, forever. Shuffles are seeded: one fixed layout per level
// (seed 0), or the shared seed of a live room or daily, so the same seed is the same road.

const L = () => ROAD_CFG.segLength;

/** A run of `segs` segments sharing one set-piece feature. */
function addFeatureRun(kind, segs, curve, bank, trackType, extra) {
  const startIdx = track.end;
  const f = makeFeature(kind, startIdx * L(), segs * L(), extra);
  const y = lastY();
  for (let n = 0; n < segs; n++) {
    addSegment(curve, y, bank, trackType);
    track.ring[(startIdx + n) & MASK].feature = f;
  }
  return f;
}

// Curve amplitude per level: level 1 is gentler, level 5 is the full playset (every level
// still gets every shape).
const AMP = [0.8, 0.88, 0.95, 1, 1.08, 1.02];
// How long the sweeping corners hold per level: the orbit skyway (level 6, ticket 0155) bends
// in long orbital arcs.
const HOLD = [1, 1, 1, 1, 1, 1.6];
let amp = 1, hold = 1;

export const CURVES = ['sweep', 'sBends', 'hairpin', 'crest', 'chicane', 'doubleApex'];
export const SET_PIECES = ['loop', 'corkscrew', 'jump', 'wallride'];

const PIECES = {
  sweep: (d) => addRoadSection(12, Math.round(26 * hold), 12, 0.7 * d * amp, 260, 0.12 * d),
  sBends: (d) => { addRoadSection(10, 16, 10, 1.6 * d * amp, 180, 0.32 * d); addRoadSection(10, 16, 10, -1.6 * d * amp, -180, -0.32 * d); },
  hairpin: (d) => { addRoadSection(8, 8, 6, 0, 0, 0); addRoadSection(12, 30, 12, 2.6 * d * amp, 0, 0.55 * d); },
  crest: (d) => { addRoadSection(10, 10, 12, 0, 900, 0); addRoadSection(12, 10, 10, 0.4 * d, -900, 0.08 * d); },
  // A quick left-right-left flick between two short straights.
  chicane: (d) => {
    addRoadSection(4, 6, 4, 0, 0, 0);
    addRoadSection(4, 6, 4, 1.9 * d * amp, 0, 0.25 * d);
    addRoadSection(4, 8, 4, -2.0 * d * amp, 0, -0.28 * d);
    addRoadSection(4, 6, 4, 1.4 * d * amp, 0, 0.2 * d);
  },
  // A long banked 180 with two apexes: turn in, ease off mid-corner, tighten into the second.
  doubleApex: (d) => {
    addRoadSection(10, Math.round(22 * hold), 6, 2.0 * d * amp / hold, 140, 0.45 * d);
    addRoadSection(4, 6, 4, 0.9 * d * amp, 0, 0.2 * d);
    addRoadSection(6, Math.round(22 * hold), 10, 2.3 * d * amp / hold, -140, 0.5 * d);
  },
  gate: (boostTo, lead = '') => addFeatureRun('BOOSTER', 12, 0, 0, 'BOOSTER', { boostTo, lead }),
  loop: () => {
    PIECES.gate(loopEntryMph(), 'LOOP');
    addFeatureRun('LOOP', Math.round(loopLength() / L()), 0, 0, 'STANDARD', { radius: SETPIECE.LOOP.radius, minMph: SETPIECE.LOOP.minMph });
    addRoadSection(6, 10, 6, 0, 0, 0);
  },
  corkscrew: (d) => {
    PIECES.gate(50);
    addFeatureRun('CORKSCREW', Math.round(SETPIECE.CORKSCREW.length / L()), 1.1 * d, 0, 'STANDARD', { dir: d });
    addRoadSection(6, 10, 6, 0, 0, 0);
  },
  jump: () => {
    PIECES.gate(SETPIECE.JUMP.launchMph);
    addRoadSection(2, 4, 2, 0, 160, 0, 'JUMP_RAMP');
    addFeatureRun('GAP', Math.round(SETPIECE.JUMP.gap / L()), 0, 0, 'GAP');
    addRoadSection(4, 10, 6, 0, -160, 0);
  },
  wallride: (d) => {
    PIECES.gate(50);
    addFeatureRun('WALLRIDE', Math.round(SETPIECE.WALLRIDE.length / L()), 2.2 * d, SETPIECE.WALLRIDE.bank * d, 'STANDARD', { dir: d });
    addRoadSection(8, 8, 8, 0.6 * d, 0, 0.2 * d);
  },
};

/** Deterministic hash → [0, 1) for (seed, k). */
function unit(seed, k) {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 0x2545f491, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

// Where the four set pieces sit in a bag of ten: never two in a row, never at either end
// (so bags never butt two set pieces together either).
const SLOTS = [[1, 3, 5, 8], [1, 4, 6, 8], [1, 3, 6, 8], [2, 4, 6, 8]];

/**
 * Bag number `n` for a level and seed, written into `out` as [piece, dir] pairs (reused).
 * Bag 0 of every level opens with its signature set piece in the first slot (a loop on
 * level 1, the gap jump on level 2…) so a short race always meets one early.
 */
export function fillBag(out, levelIndex, seed, n) {
  const key = (seed ^ Math.imul(levelIndex + 1, 0x27d4eb2d) ^ Math.imul(n + 1, 0x165667b1)) | 0;
  let r = 0;
  const rnd = () => unit(key, r++);
  const shuffle = (src) => {
    const a = src.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  const curves = shuffle(CURVES);
  const sets = shuffle(SET_PIECES);
  if (n === 0) {
    const lead = SET_PIECES[levelIndex % SET_PIECES.length];
    sets.splice(sets.indexOf(lead), 1);
    sets.unshift(lead);
  }
  const slots = SLOTS[Math.floor(rnd() * SLOTS.length)];
  out.length = 0;
  let c = 0, sp = 0;
  for (let i = 0; i < CURVES.length + SET_PIECES.length; i++) {
    const piece = slots.indexOf(i) >= 0 ? sets[sp++] : curves[c++];
    out.push(piece, rnd() < 0.5 ? -1 : 1);
  }
  return out;
}

/** The next [piece, dir] from the level's endless bag. */
function nextPiece() {
  if (track.bagPos >= track.bag.length) {
    fillBag(track.bag, Math.max(0, GameState.levelIndex | 0), track.seed, track.bagCount++);
    track.bagPos = 0;
  }
  const piece = track.bag[track.bagPos], dir = track.bag[track.bagPos + 1];
  track.bagPos += 2;
  return [piece, dir];
}

export function generateNextTrackBiome(chosenBranch = null) {
  const startIdx = track.end;
  track.generatedCount++;
  const li = Math.max(0, Math.min(AMP.length - 1, GameState.levelIndex | 0));
  amp = AMP[li] * (track.intensity || 1); hold = HOLD[li];

  if (track.generatedCount === 1) {
    addRoadSection(8, 18, 8, 0, 0, 0, 'STANDARD');
    addRoadSection(6, 14, 6, 0, 350, 0, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.75, -350, 0.15, 'STANDARD');
    populateChunkDecorations(startIdx, track.end, 'OPENING');
    return;
  }

  if (track.generatedCount % 4 === 2 && !chosenBranch) {
    addRoadSection(8, 20, 8, 0, 280, 0, 'SPLIT_FORK', FORK_INFO);
    populateChunkDecorations(startIdx, track.end, 'FORK');
    return;
  }

  if (chosenBranch === 'LEFT') {
    // The risky short way: straight into a loop.
    PIECES.loop();
    populateChunkDecorations(startIdx, track.end, 'STUNT_LOOP');
  } else if (chosenBranch === 'RIGHT') {
    // The safe long way: a fast booster tunnel through two gentle sweepers.
    addRoadSection(10, 20, 10, -0.95, 280, -0.22, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.95, -280, 0.22, 'BOOSTER');
    populateChunkDecorations(startIdx, track.end, 'SPEED_TUNNEL');
  } else {
    const [piece, dir] = nextPiece();
    track.lastPiece = piece;
    PIECES[piece](dir);
    populateChunkDecorations(startIdx, track.end, piece === 'loop' ? 'STUNT_LOOP' : piece.toUpperCase());
  }

  if (track.generatedCount % 3 === 0) {
    const cpStart = track.end;
    addRoadSection(4, 8, 4, 0, 0, 0, 'CHECKPOINT');
    populateChunkDecorations(cpStart, track.end, 'CHECKPOINT');
  }
}

// One shared, frozen fork label object (every fork shows the same two choices).
const FORK_INFO = Object.freeze({
  leftLabel: 'SKY-LOOP SHORTCUT (2X FLUX)',
  rightLabel: 'CEDAR TURBO TUNNEL (+TIME)'
});

/** True if any set piece (or a jump ramp/gap) covers track Z in [z0, z1]. */
export function hasSetPieceBetween(z0, z1) {
  const a = Math.max(0, Math.floor(z0 / L()));
  const b = Math.floor(z1 / L());
  for (let i = Math.max(a, track.start); i <= b && i < track.end; i++) {
    const s = track.ring[i & MASK];
    if (s.feature || s.trackType === 'JUMP_RAMP') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Road contract (sprint 4). Per-distance road data that the sim (handling), both renderers
// and the hazard planner read, so nobody re-derives geometry from segment internals.
// `z` is track Z in sim units (the same Z as GameState.trackPos + ROAD_CFG.playerZOffset).
// Past either end of the generated road every function returns its neutral value.

/** The segment under track Z `z`, or null. */
export function segmentAt(z) {
  return track.seg(Math.floor(z / ROAD_CFG.segLength));
}

/** Signed curvature: heading change (radians) per sim unit of Z at unit scale; + bends right. */
export function curvatureAt(z) {
  const s = segmentAt(z);
  return s ? s.curve / ROAD_CFG.segLength : 0;
}

/** Bank (roll) of the road surface in radians-ish units as stored on segments; + leans right. */
export function bankAt(z) {
  const s = segmentAt(z);
  return s ? s.bank : 0;
}

/** Pitch of the road (radians, + climbs) from the segment's elevation change. */
export function pitchAt(z) {
  const s = segmentAt(z);
  return s ? Math.atan2(s.p2.world.y - s.p1.world.y, ROAD_CFG.segLength) : 0;
}

/**
 * The set piece at `z`, or null. A feature is one shared object over its segments:
 * { kind: 'LOOP'|'CORKSCREW'|'JUMP'|'WALLRIDE'|'BOOSTER', z0, length, ...kind params }
 * with `t = (z - z0) / length` the progress through it. Kinds and params: src/setpieces.js.
 */
export function featureAt(z) {
  const s = segmentAt(z);
  return s ? s.feature : null;
}
