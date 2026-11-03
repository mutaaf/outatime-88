// "Camera effects" (ticket 0216), pure: Settings → Camera effects scales camera shake and the FOV
// push-in (speed, NOS, the 3D warp kick) without touching speed lines, flashes or the warp colours.
// Calm motion (GameState.reducedMotion) already turns every camera effect off in the renderers, so
// it wins over any mode here without being folded into the scale. Imported only by the lazy settings
// panel, which sets GameState.cameraFx when it loads (at boot when a save calms the camera) and on
// every change; src/render/ and src/render3d/ multiply by it. The sim never reads it.
export const CAMERA_FX = Object.freeze({ full: 1, gentle: 0.4, off: 0 });

/** Scale for the setting `mode`: 'full' 1, 'gentle' 0.4, 'off' 0; anything else is full. */
export const cameraFxScale = (mode) => (Object.hasOwn(CAMERA_FX, mode) ? CAMERA_FX[mode] : 1);
