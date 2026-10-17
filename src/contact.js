// Where the player's tyres touch the road, in track Z. Pure simulation input.
//
// This used to be a side effect of the 2D renderer (it searched the projected road for the
// screen row under the tyres), which meant the physics read a value the renderer wrote.
// It is now computed here, from the same projection maths, so the simulation is the same
// whichever renderer (2D canvas or 3D) is drawing. `rh` is the 2D canvas's logical height;
// pass it even in 3D mode so contacts stay identical between modes.
import { ROAD_CFG } from './data.js';

export const TYRE_LINE = 0.87;

/** Camera depth after the speed-based FOV stretch (shared with the 2D renderer). */
export function cameraDepth(camCfg, speed) {
  return Math.max(0.62, camCfg.depth - Math.max(0, (speed - 70) * 0.0022));
}

function screenY(worldY, worldZ, camY, camZ, depth, h) {
  const z = Math.max(1, worldZ - camZ);
  return Math.round((h / 2) - ((depth / z) * (worldY - camY) * h / 2));
}

/**
 * @returns {number|null} track Z under the tyre line, or null when no visible segment
 *   crosses it (callers keep the previous value, as the renderer used to).
 */
export function contactZ(segments, state, camCfg, rh) {
  const baseIndex = Math.floor(state.trackPos / ROAD_CFG.segLength);
  const basePercent = (state.trackPos % ROAD_CFG.segLength) / ROAD_CFG.segLength;
  const baseSeg = segments[baseIndex] || segments[0];
  if (!baseSeg) return null;
  const elevation = baseSeg.p1.world.y + (baseSeg.p2.world.y - baseSeg.p1.world.y) * basePercent;
  const camY = elevation + camCfg.height + state.playerY * 3.5;
  const camZ = state.trackPos;
  const depth = cameraDepth(camCfg, state.speed);
  const tyreY = Math.floor(rh * TYRE_LINE);
  let maxY = rh;
  for (let n = 0; n < ROAD_CFG.drawDistance; n++) {
    const seg = segments[baseIndex + n];
    if (!seg) break;
    const y1 = screenY(seg.p1.world.y, seg.p1.world.z, camY, camZ, depth, rh);
    const y2 = screenY(seg.p2.world.y, seg.p2.world.z, camY, camZ, depth, rh);
    if (Math.max(1, seg.p1.world.z - camZ) <= depth || y2 >= maxY || y2 >= y1) continue;
    if (y1 >= tyreY && y2 <= tyreY) {
      const t = (y1 - tyreY) / Math.max(1, y1 - y2);
      return seg.p1.world.z + t * ROAD_CFG.segLength;
    }
    maxY = y2;
  }
  return null;
}
