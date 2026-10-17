// Lazy entry points into the three.js chunk. Nothing here imports three, so the 2D bundle
// stays small; the first call downloads the 3D chunk (shared by both).
/** The full 3D race view (see src/render3d/view.js). */
export const loadView3D = () => import('./render3d/view.js');
/** A single rotating car model rendered into a canvas, e.g. for the garage. */
export const loadCarPreview = () => import('./render3d/preview.js');
