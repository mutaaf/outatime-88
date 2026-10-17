import { describe, it, expect } from 'vitest';
import { bodyPose, playerPose } from '../../src/render-pose.js';
import { ROAD_CFG } from '../../src/data.js';

describe('render pose contract', () => {
  it('draws raw simulation values when no interpolated transform is published', () => {
    const out = {};
    expect(bodyPose({ worldZ: 900, offset: -0.3, y: 4, suspY: 1, rot: 0.2, yaw: 0.1 }, out))
      .toEqual({ z: 900, offset: -0.3, y: 5, rot: 0.2, yaw: 0.1 });
    expect(bodyPose({ worldZ: 1, offset: 0 }, {})).toEqual({ z: 1, offset: 0, y: 0, rot: 0, yaw: 0 });
  });

  it('prefers interpolated render transforms when the simulation publishes them', () => {
    const p = bodyPose({ worldZ: 900, renderZ: 880, offset: 0.2, renderOffset: 0.18, y: 9, renderY: 7, rot: 1, renderRot: 0.9, yaw: 0, renderYaw: 0.05 }, {});
    expect(p).toEqual({ z: 880, offset: 0.18, y: 7, rot: 0.9, yaw: 0.05 });
  });

  it('player: contact Z, then the camera fallback; render fields win', () => {
    expect(playerPose({ visualPlayerZ: 5000, trackPos: 1, playerX: 0.1, playerY: 3 }, {})).toEqual({ z: 5000, x: 0.1, y: 3 });
    expect(playerPose({ trackPos: 100, playerX: 0, playerY: 0 }, {}).z).toBe(100 + ROAD_CFG.playerZOffset);
    expect(playerPose({ visualPlayerZ: 5000, renderPlayerZ: 4990, renderPlayerX: 0.2, renderPlayerY: 1, playerX: 0, playerY: 0 }, {}))
      .toEqual({ z: 4990, x: 0.2, y: 1 });
  });
});
