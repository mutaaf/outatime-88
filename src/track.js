// Track generation: the endless road as a list of segments, built a biome at a time.
// No rendering here. Module bindings are read-only, so the segment list lives on a
// mutable container that main.js reads as `track.segments`.
import { ROAD_CFG } from './data.js';
import { GameState } from './state.js';
import { SETPIECE, loopLength, makeFeature } from './setpieces.js';

export const track = { segments: [], generatedCount: 0, line: null };

/** The race's racing line (src/cleanline.js): hazards are never placed on it. */
export function setTrackLine(line) {
  track.line = line;
}

export function resetTrack() {
  track.segments = [];
  track.generatedCount = 0;
}

export function buildInitialTrack() {
  resetTrack();
  for (let i = 0; i < 6; i++) {
    generateNextTrackBiome();
  }
}


export function addSegment(curve, y, bank, trackType, forkInfo = null) {
  const idx = track.segments.length;
  track.segments.push({
    index: idx,
    p1: { world: { x: 0, y: idx === 0 ? 0 : track.segments[idx - 1].p2.world.y, z: idx * ROAD_CFG.segLength }, camera: {}, screen: {} },
    p2: { world: { x: 0, y: y, z: (idx + 1) * ROAD_CFG.segLength }, camera: {}, screen: {} },
    curve: curve,
    bank: bank,
    trackType: trackType,
    forkInfo: forkInfo,
    feature: null, // a set piece covering this segment (see featureAt), shared by its segments
    items: [],
    cars: [],
    flameLeft: false,
    flameRight: false
  });
}

export function addRoadSection(enter, hold, leave, curve, yDelta, bank, trackType = 'STANDARD', forkInfo = null) {
  const startY = track.segments.length === 0 ? 0 : track.segments[track.segments.length - 1].p2.world.y;
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
    const seg = track.segments[i];
    if (!seg) continue;
    // Set pieces stay clean: no lamps on a loop, no coins over a gap (booster gates keep theirs).
    if ((seg.feature && seg.feature.kind !== 'BOOSTER') || seg.trackType === 'JUMP_RAMP') continue;

    // Night-Street Smoke Flares on Checkpoints & Forks
    if (seg.trackType === 'CHECKPOINT' && i === startIdx + 2) {
      seg.items.push({ offset: -1.15, type: 'MC_FLARE_GREEN' });
      seg.items.push({ offset: 1.15, type: 'MC_FLARE_GREEN' });
    }

    // Roadside Streetlamps, Billboards & Orange-Track Arches
    if (i % 6 === 0) {
      const propTypes = ['STREET_LAMP', 'SIGN_88', 'PALM_TREE', 'CLOCK_TOWER_BILLBOARD', 'ARCH_HW'];
      const pType = propTypes[(i / 6) % propTypes.length | 0];
      seg.items.push({ offset: -1.42, type: pType });
      seg.items.push({ offset: 1.42, type: pType });
    }

    // Overhead Loop & Tunnel Rings
    if ((seg.trackType === 'LOOP' || seg.trackType === 'BOOSTER') && i % 3 === 0) {
      seg.items.push({ offset: 0, type: 'OVERHEAD_GATE' });
    }

    // Animated 3D Power-Ups (Plutonium Cores, Orange-Track Flame Coins) & Destructible 2026 Obstacles
    if (i % 18 === 0 && seg.trackType !== 'CHECKPOINT') {
      const lane = ((i * 19) % 3) - 1;
      const isPlutonium = (i % 12 === 0) || (patternType === 'STUNT_LOOP');
      seg.items.push({
        offset: lane * 0.52,
        type: isPlutonium ? 'PLUTONIUM' : 'HW_COIN',
        collected: false,
        phase: i * 0.8
      });
    }

    // Spawn Nano-Wrench HP Repair Pickups every 22 segments
    if (i > 30 && i % 38 === 0 && seg.trackType !== 'CHECKPOINT') {
      const healLane = (((i * 7) % 3) - 1) * 0.52;
      seg.items.push({
        offset: healLane,
        type: 'REPAIR_WRENCH',
        collected: false,
        phase: i * 0.4
      });
    }
  }
}

// ---------------------------------------------------------------------------------------
// Orange-track layouts (sprint 4). Each level cycles its own book of pieces: sweepers, S-bends,
// banked hairpins, blind crests and toy-track set pieces (loops, corkscrews, gap jumps,
// wall-ride half-pipes), each set piece led in by a booster gate. Deterministic per level.

const L = () => ROAD_CFG.segLength;
const lastY = () => (track.segments.length ? track.segments[track.segments.length - 1].p2.world.y : 0);

/** A run of `segs` segments sharing one set-piece feature. */
function addFeatureRun(kind, segs, curve, bank, trackType, extra) {
  const startIdx = track.segments.length;
  const f = makeFeature(kind, startIdx * L(), segs * L(), extra);
  const y = lastY();
  for (let n = 0; n < segs; n++) {
    addSegment(curve, y, bank, trackType);
    track.segments[startIdx + n].feature = f;
  }
  return f;
}

const PIECES = {
  sweep: (d) => addRoadSection(12, 26, 12, 0.7 * d, 260, 0.12 * d),
  sBends: (d) => { addRoadSection(10, 16, 10, 1.6 * d, 180, 0.32 * d); addRoadSection(10, 16, 10, -1.6 * d, -180, -0.32 * d); },
  hairpin: (d) => { addRoadSection(8, 8, 6, 0, 0, 0); addRoadSection(12, 30, 12, 2.6 * d, 0, 0.55 * d); },
  crest: () => { addRoadSection(10, 10, 12, 0, 900, 0); addRoadSection(12, 10, 10, 0.4, -900, 0.08); },
  gate: (minMph) => addFeatureRun('BOOSTER', 12, 0, 0, 'BOOSTER', { minMph }),
  loop: () => {
    PIECES.gate(SETPIECE.LOOP.minMph);
    addFeatureRun('LOOP', Math.round(loopLength() / L()), 0, 0, 'STANDARD', { radius: SETPIECE.LOOP.radius, minMph: SETPIECE.LOOP.minMph });
    addRoadSection(6, 10, 6, 0, 0, 0);
  },
  corkscrew: (d) => {
    PIECES.gate(50);
    addFeatureRun('CORKSCREW', Math.round(SETPIECE.CORKSCREW.length / L()), 1.1 * d, 0, 'STANDARD', { dir: d });
    addRoadSection(6, 10, 6, 0, 0, 0);
  },
  jump: () => {
    PIECES.gate(60);
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

// Per level: [piece, direction]. Level 1 is gentle; level 5 is the full orange-track playset.
const BOOKS = [
  [['sweep', 1], ['sBends', 1], ['crest', 1], ['loop', 1], ['sBends', -1], ['jump', 1]],
  [['sweep', -1], ['crest', 1], ['jump', 1], ['hairpin', 1], ['sBends', -1], ['corkscrew', 1]],
  [['sBends', 1], ['loop', 1], ['wallride', -1], ['crest', 1], ['corkscrew', -1], ['jump', 1]],
  [['hairpin', 1], ['sBends', -1], ['hairpin', -1], ['corkscrew', 1], ['loop', 1], ['wallride', 1]],
  [['loop', 1], ['jump', 1], ['corkscrew', -1], ['wallride', 1], ['hairpin', -1], ['loop', 1]],
];

export function generateNextTrackBiome(chosenBranch = null) {
  const startIdx = track.segments.length;
  track.generatedCount++;

  if (track.generatedCount === 1) {
    addRoadSection(8, 18, 8, 0, 0, 0, 'STANDARD');
    addRoadSection(6, 14, 6, 0, 350, 0, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.75, -350, 0.15, 'STANDARD');
    populateChunkDecorations(startIdx, track.segments.length, 'OPENING');
    return;
  }

  if (track.generatedCount % 4 === 2 && !chosenBranch) {
    addRoadSection(8, 20, 8, 0, 280, 0, 'SPLIT_FORK', {
      leftLabel: 'SKY-LOOP SHORTCUT (2X FLUX)',
      rightLabel: 'CEDAR TURBO TUNNEL (+TIME)'
    });
    populateChunkDecorations(startIdx, track.segments.length, 'FORK');
    return;
  }

  if (chosenBranch === 'LEFT') {
    // The risky short way: straight into a loop.
    PIECES.loop();
    populateChunkDecorations(startIdx, track.segments.length, 'STUNT_LOOP');
  } else if (chosenBranch === 'RIGHT') {
    // The safe long way: a fast booster tunnel through two gentle sweepers.
    addRoadSection(10, 20, 10, -0.95, 280, -0.22, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.95, -280, 0.22, 'BOOSTER');
    populateChunkDecorations(startIdx, track.segments.length, 'SPEED_TUNNEL');
  } else {
    const book = BOOKS[Math.max(0, Math.min(BOOKS.length - 1, GameState.levelIndex | 0))];
    const [piece, dir] = book[(track.generatedCount - 2) % book.length];
    PIECES[piece](dir);
    populateChunkDecorations(startIdx, track.segments.length, piece === 'loop' ? 'STUNT_LOOP' : piece.toUpperCase());
  }

  if (track.generatedCount % 3 === 0) {
    const cpStart = track.segments.length;
    addRoadSection(4, 8, 4, 0, 0, 0, 'CHECKPOINT');
    populateChunkDecorations(cpStart, track.segments.length, 'CHECKPOINT');
  }
}

/** True if any set piece (or a jump ramp/gap) covers track Z in [z0, z1]. */
export function hasSetPieceBetween(z0, z1) {
  const a = Math.max(0, Math.floor(z0 / L()));
  const b = Math.floor(z1 / L());
  for (let i = a; i <= b && i < track.segments.length; i++) {
    const s = track.segments[i];
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
  return track.segments[Math.floor(z / ROAD_CFG.segLength)] || null;
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
