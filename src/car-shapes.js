// One source of truth for every car body (workstream J): the garage turntable, the 2D race
// sprites, the loop view and the 3D thrusters all read these numbers, so a car looks, lights
// and breathes fire from the same places everywhere.
//
// Units are metres, nose toward +z, origin on the road under the car's centre.
//   L, W            length and width
//   hull [y0, y1]   underside and shoulder/deck height
//   nose            how far the bonnet drops toward the front (0 flat … 0.62 wedge)
//   cab [z0, z1, base, top, rake]   the greenhouse; null for a box trailer
//   round           superellipse exponent of the body's cross-section (higher = boxier)
//   lights          tail-light style (src/car-paint.js)
//   exhaust         [x, y, radius] tips on the rear face: where flames, NOS and plumes come out
//   thrust          'exhaust' (fire) · 'jet' (one big nozzle) · 'cold' (electric: cold-gas
//                   puffs and a diffuser glow, never fire) · 'cycle' · 'none'
//   axles           wheel centres along z (default: one per end); dual = twin tyres
const SHAPES = {
  GULLWING: { L: 4.2, W: 1.86, hull: [0.32, 0.72], nose: 0.42, cab: [-0.55, 0.85, 0.72, 1.12, 0.3], extras: ['vents'], round: 6,
    lights: 'slats', exhaust: [[-0.56, 0.37, 0.06], [0.56, 0.37, 0.06]], thrust: 'exhaust' },
  MUSCLE: { L: 4.6, W: 1.95, hull: [0.32, 0.82], nose: 0.2, cab: [-0.75, 0.55, 0.82, 1.28, 0.24], extras: ['scoop'], round: 4.5,
    lights: 'twin', exhaust: [[-0.74, 0.33, 0.055], [-0.6, 0.33, 0.055], [0.6, 0.33, 0.055], [0.74, 0.33, 0.055]], thrust: 'exhaust' },
  TUNER_WING: { L: 4.3, W: 1.8, hull: [0.3, 0.74], nose: 0.32, cab: [-0.5, 0.75, 0.74, 1.18, 0.3], extras: ['wing'], round: 5,
    lights: 'quad', exhaust: [[-0.6, 0.32, 0.075], [0.6, 0.32, 0.075]], thrust: 'exhaust' },
  SCANNER: { L: 4.5, W: 1.86, hull: [0.3, 0.7], nose: 0.5, cab: [-0.6, 0.6, 0.7, 1.1, 0.32], extras: ['scanner'], round: 5,
    lights: 'bar', exhaust: [[-0.5, 0.33, 0.06], [0.5, 0.33, 0.06]], thrust: 'exhaust' },
  ROCKET: { L: 4.4, W: 1.75, hull: [0.28, 0.66], nose: 0.62, cab: [-0.9, 0.35, 0.66, 1.04, 0.3], extras: ['fin'], round: 4,
    lights: 'quad', exhaust: [[0, 0.47, 0.15]], thrust: 'jet' },
  HEAVY_VAN: { L: 4.9, W: 2.0, hull: [0.36, 1.0], nose: 0.08, cab: [-2.05, 1.35, 1.0, 1.95, 0.06], extras: [], van: true, round: 8,
    lights: 'vert', exhaust: [[0.72, 0.32, 0.06]], thrust: 'exhaust' },
  LIGHTCYCLE: { L: 3.2, W: 0.62, hull: [0.5, 0.9], nose: 0.5, cab: [-0.6, 0.35, 0.9, 1.1, 0.12], extras: ['ribbon'], cycle: true, round: 2.6, r: 0.48,
    lights: 'cycle', exhaust: [[0, 0.66, 0.08]], thrust: 'cycle' },
  // The electric roadster (VOLT ROADSTER): low, wide, a full-width light bar, no tailpipes.
  // Its "exhaust" is a pair of cold-gas nozzles behind the number plate.
  ROADSTER: { L: 3.95, W: 1.86, hull: [0.27, 0.7], nose: 0.46, cab: [-0.9, 0.28, 0.7, 1.06, 0.34], extras: ['diffuserGlow'], round: 4.2,
    lights: 'bar', exhaust: [[-0.17, 0.45, 0.045], [0.17, 0.45, 0.045]], thrust: 'cold' },
  // Highway traffic (not in the roster): drawn by the same painter as everyone else.
  SEDAN: { L: 4.7, W: 1.84, hull: [0.32, 0.92], nose: 0.25, cab: [-1.25, 0.85, 0.92, 1.45, 0.32], extras: [], round: 4,
    lights: 'sedan', exhaust: [[-0.6, 0.3, 0.045]], thrust: 'exhaust' },
  TAXI: { L: 4.7, W: 1.84, hull: [0.32, 0.92], nose: 0.25, cab: [-1.25, 0.85, 0.92, 1.45, 0.32], extras: ['taxi'], round: 4,
    lights: 'sedan', exhaust: [[-0.6, 0.3, 0.045]], thrust: 'exhaust' },
  SUV: { L: 4.8, W: 1.95, hull: [0.4, 1.08], nose: 0.18, cab: [-2.0, 1.1, 1.08, 1.78, 0.14], extras: [], round: 5,
    lights: 'vert', exhaust: [[-0.62, 0.36, 0.05]], thrust: 'exhaust' },
  SEMI_TRUCK: { L: 12, W: 2.5, hull: [1.0, 4.0], nose: 0, cab: null, extras: ['truck'], round: 14,
    lights: 'truck', exhaust: [], thrust: 'none', axles: [-4.7, -3.4], dual: true, r: 0.5 },
};

/** A shape's dimensions (falls back to the flux coupe for unknown names). */
export const shapeOf = (shape) => SHAPES[shape] || SHAPES.GULLWING;
export const hasShape = (shape) => Boolean(SHAPES[shape]);

/** Highest point of a body (metres): roof, wing or trailer top. */
export function topOf(S) {
  let t = Math.max(S.hull[1], S.cab ? S.cab[3] : 0);
  if (S.extras.includes('wing')) t = Math.max(t, S.hull[1] + 0.42);
  if (S.extras.includes('fin')) t = Math.max(t, S.hull[1] + 0.52);
  if (S.extras.includes('taxi')) t = Math.max(t, S.cab[3] + 0.24);
  return t;
}
