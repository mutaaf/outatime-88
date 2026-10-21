// The 2D renderer's canvases (ticket 0015): the display canvas and the pixel buffer the road
// is drawn into, their sizes, and the era's render config. main.js and src/render/ share these.
import { GameState } from '../state.js';
import { ERAS } from '../data.js';
import { gfxQ } from '../main.js';

export const mainCanvas = document.getElementById('gameCanvas');
export const mainCtx = mainCanvas.getContext('2d');
export const pixelCanvas = document.createElement('canvas');
export const pixelCtx = pixelCanvas.getContext('2d');

// The display canvas is sized in CSS px (viewW × viewH, what all 2D drawing code works in)
// and backed by viewK device pixels per CSS px, so phones and tablets get crisp lines instead
// of a 1× image stretched 2–3×. viewK follows the graphics tier and the governor (gfxQ.dpr:
// LOW stays at 1×, ULTRA reaches 2×), so slow devices pay nothing.
export let viewW = 320, viewH = 240, viewK = 1;
const backingScale = () => Math.max(1, Math.min(window.devicePixelRatio || 1, gfxQ.dpr || 1, 2));
export function resizeCanvases() {
  const container = document.getElementById('canvasContainer');
  const w = container ? container.clientWidth : window.innerWidth;
  const h = container ? container.clientHeight : window.innerHeight;
  viewW = Math.max(320, w);
  viewH = Math.max(240, h);
  viewK = backingScale();
  mainCanvas.width = Math.round(viewW * viewK);
  mainCanvas.height = Math.round(viewH * viewK);
}
/** Start a frame on the display canvas: CSS-px coordinates at the current backing scale. */
export function beginMainFrame() {
  if (backingScale() !== viewK) resizeCanvases();
  mainCtx.setTransform(viewK, 0, 0, viewK, 0, 0);
}


export function drawPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

/** Logical height of the 2D road canvas (era pixel scale applied). */
export function roadCanvasHeight() {
  const scale = getActiveEraRenderConfig().pixelScale || 1.0;
  return Math.max(160, Math.floor(viewH / scale));
}

export function getActiveEraRenderConfig() {
  if (GameState.visualOverride === '8BIT') return ERAS[0];
  if (GameState.visualOverride === '16BIT') return ERAS[1];
  if (GameState.visualOverride === 'HD') return ERAS[3];
  return ERAS[GameState.eraIndex];
}
