// One car on a turntable, rendered into a canvas you give it (the garage preview).
// Lightweight: its own small renderer, two lights, the same car models as the race.
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { buildCar, NEON_CYAN } from './meshes.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {string} [opts.style='TIME_CAR']  TIME_CAR | MUSCLE | TUNER_WING | SEDAN | TAXI | SUV | SEMI_TRUCK
 * @param {string} [opts.body]       paint colour
 * @param {string} [opts.underglow]  underglow colour
 * @param {boolean} [opts.spin=true] turntable rotation (off under prefers-reduced-motion)
 * @returns {{ update(opts: object): void, dispose(): void }}
 */
export function createCarPreview(canvas, opts = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(8.5, 4.2, 10.5);
  camera.lookAt(0, 0.7, 0);
  scene.add(new HemisphereLight('#ff7ad9', '#1a1035', 1.4));
  const key = new DirectionalLight('#ffd7a8', 2.0);
  key.position.set(6, 9, 4);
  scene.add(key);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let car = null, style = null, angle = -2.2, raf = 0, last = 0, spin = true;

  function update(o = {}) {
    const next = o.style || style || 'TIME_CAR';
    if (next !== style) {
      if (car) { scene.remove(car); car.traverse((m) => m.geometry && m.geometry.dispose()); }
      style = next;
      car = next === 'SEMI_TRUCK' ? buildCar(next, 10, 3.4) : buildCar(next, 6.6, 3.0);
      scene.add(car);
    }
    if (o.body) car.userData.paint.color.set(o.body);
    car.userData.glow.color.set(new Color(o.underglow || NEON_CYAN));
    if (o.spin !== undefined) spin = o.spin;
  }

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    if (spin && !reduced) angle += dt * 0.6;
    car.rotation.y = angle;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  update(opts);
  raf = requestAnimationFrame(frame);
  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse((m) => m.geometry && m.geometry.dispose());
      renderer.dispose();
    },
  };
}
