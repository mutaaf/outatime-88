// The one place renderers read where things are. A fixed-timestep simulation may publish
// interpolated transforms for the frame being drawn; when it does, renderers draw those,
// otherwise the raw simulation values. Contract (AGENTS.md § sim/render rule):
//   bodies (cars, obstacles, knockables): renderZ, renderOffset, renderY, renderRot, renderYaw
//   player (GameState):                   renderPlayerZ, renderPlayerX, renderPlayerY
// Pure and allocation-free: results are written into `out`.
import { ROAD_CFG } from './data.js';

export function bodyPose(b, out) {
  out.z = b.renderZ ?? b.worldZ;
  out.offset = b.renderOffset ?? b.offset;
  out.y = (b.renderY ?? b.y ?? 0) + (b.suspY || 0);
  out.rot = b.renderRot ?? b.rot ?? 0;
  out.yaw = b.renderYaw ?? b.yaw ?? 0;
  return out;
}

export function playerPose(s, out) {
  out.z = s.renderPlayerZ ?? (s.visualPlayerZ || (s.trackPos + ROAD_CFG.playerZOffset));
  out.x = s.renderPlayerX ?? s.playerX;
  out.y = s.renderPlayerY ?? s.playerY;
  return out;
}
