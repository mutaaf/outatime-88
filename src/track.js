// Track generation: the endless road as a list of segments, built a biome at a time.
// No rendering here. Module bindings are read-only, so the segment list lives on a
// mutable container that main.js reads as `track.segments`.
import { ROAD_CFG } from './data.js';
import { GameState } from './state.js';

export const track = { segments: [], generatedCount: 0 };

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

  const roll = chosenBranch === 'LEFT' ? 0 : (chosenBranch === 'RIGHT' ? 1 : ((track.generatedCount + GameState.levelIndex) % 5));

  if (roll === 0) {
    addRoadSection(8, 14, 8, 0, 0, 0, 'BOOSTER');
    addRoadSection(12, 24, 12, 0.45, 650, 0.18, 'LOOP');
    addRoadSection(12, 20, 12, -0.45, -650, -0.18, 'LOOP');
    populateChunkDecorations(startIdx, track.segments.length, 'STUNT_LOOP');
  } else if (roll === 1) {
    addRoadSection(10, 20, 10, -0.95, 280, -0.22, 'BOOSTER');
    addRoadSection(10, 20, 10, 0.95, -280, 0.22, 'BOOSTER');
    populateChunkDecorations(startIdx, track.segments.length, 'SPEED_TUNNEL');
  } else if (roll === 2) {
    addRoadSection(10, 16, 8, 0, 520, 0, 'JUMP_RAMP');
    addRoadSection(8, 18, 10, -0.7, -520, -0.15, 'STANDARD');
    populateChunkDecorations(startIdx, track.segments.length, 'JUMP');
  } else if (roll === 3) {
    // Smooth Sweeping Cedar Ridge S-Curves
    addRoadSection(12, 22, 12, 1.15, 380, 0.25, 'STANDARD');
    addRoadSection(12, 20, 12, -1.1, -380, -0.25, 'STANDARD');
    populateChunkDecorations(startIdx, track.segments.length, 'CORKSCREW');
  } else {
    addRoadSection(10, 18, 10, 0.65, 320, 0.12, 'STANDARD');
    addRoadSection(8, 14, 8, 0, -320, 0, 'CHECKPOINT');
    populateChunkDecorations(startIdx, track.segments.length, 'CHECKPOINT');
  }

  if (track.generatedCount % 3 === 0) {
    const cpStart = track.segments.length;
    addRoadSection(4, 8, 4, 0, 0, 0, 'CHECKPOINT');
    populateChunkDecorations(cpStart, track.segments.length, 'CHECKPOINT');
  }
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
