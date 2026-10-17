// Per-object physical materials (ticket 0074). Every obstacle and prop type has its own mass,
// bounce, ground friction and behaviour, so a pine tree stops you dead, a barricade shoves,
// and a traffic cone goes cartwheeling. Units match RigidBody3D: kg, lane units, world Z.
//
//   static     immovable (infinite mass): you bounce off it, it never moves
//   knockable  a light prop the car swats aside with a real momentum exchange
//   damage     HP a hit costs at the old 14-HP scale (0 = harmless, only a penalty)
//   penalty    which penalty table the hit charges (src/scoring.js)

export const MATERIALS = {
  PINE_TREE_HAZARD: { massKg: Infinity, restitution: 0.2, friction: 3.0, static: true, damage: 14, penalty: 'obstacle', halfW: 0.21, height: 38, halfL: 145 },
  LOW_LASER_BAR: { massKg: 240, restitution: 0.55, friction: 1.8, damage: 15, penalty: 'obstacle', halfW: 0.21, height: 22, halfL: 145 },
  HIGH_LIGHT_GATE: { massKg: 320, restitution: 0.5, friction: 1.8, damage: 15, penalty: 'obstacle', halfW: 0.21, height: 68, clearanceY: 24, halfL: 145 },
  HOLO_BARRIER: { massKg: 320, restitution: 0.65, friction: 1.8, damage: 14, penalty: 'obstacle', halfW: 0.21, height: 38, halfL: 145 },
  FLUX_CRATE: { massKg: 180, restitution: 0.4, friction: 2.2, damage: 14, penalty: 'obstacle', halfW: 0.21, height: 38, halfL: 145 },
  // Props: light, knocked flying by a real impulse; they tumble, bounce and settle.
  TRAFFIC_CONE: { massKg: 4, restitution: 0.45, friction: 2.6, knockable: true, damage: 0, penalty: 'cone', halfW: 0.045, height: 18, halfL: 32 },
  OIL_BARREL: { massKg: 95, restitution: 0.3, friction: 1.1, knockable: true, damage: 4, penalty: 'obstacle', halfW: 0.07, height: 30, halfL: 46 },
};

export const materialFor = (type) => MATERIALS[type] || MATERIALS.HOLO_BARRIER;

/**
 * One-dimensional impulse exchange along the impact axis between a car (mass mCar,
 * velocity vCar) and a body (mass mBody, velocity vBody), with restitution e.
 * Returns the new velocities. A static body (Infinity) reflects the car: vCar' = vBody − e·(vCar − vBody).
 */
export function impactVelocities(mCar, vCar, mBody, vBody, e) {
  if (!Number.isFinite(mBody)) return { car: vBody - e * (vCar - vBody), body: vBody };
  const vRel = vCar - vBody;
  const j = (1 + e) * vRel / (1 / mCar + 1 / mBody); // impulse magnitude
  return { car: vCar - j / mCar, body: vBody + j / mBody };
}
