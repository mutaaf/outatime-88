// Pseudo-3D road projection (world → camera → screen).
import { ROAD_CFG } from './data.js';

/** `cx` is the screen x of the view's centre line (default: mid-screen; the 2D camera shifts it
 *  to look into a corner, ticket 0181). */
export function projectPoint(p, cameraX, cameraY, cameraZ, camDepth, width, height, cx = width / 2) {
  const dz = p.world.z - cameraZ;
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = Math.max(1, dz);
  p.screen.scale = camDepth / p.camera.z;
  p.screen.x = Math.round(cx + (p.screen.scale * p.camera.x * width / 2));
  p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
  p.screen.w = Math.round(p.screen.scale * ROAD_CFG.roadWidth * width / 2);
}
