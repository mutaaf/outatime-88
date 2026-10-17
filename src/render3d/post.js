// Post-processing for HIGH/ULTRA (ticket 0041): neon bloom, a light vignette, filmic output
// and FXAA. Its own lazy chunk — LOW/MEDIUM never download it — and the governor turns it off
// (step 2+) before touching anything the player would notice more.
import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

/**
 * @returns {{ render(): void, setSize(w, h, dpr): void, setWarp(k: number): void, dispose(): void }}
 */
export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom only catches what is really bright: the unlit neon (toneMapped: false), the sun,
  // headlights and flux fire. Half-resolution internally, so it stays cheap.
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.35, 0.82);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.0;
  vignette.uniforms.darkness.value = 1.05;
  composer.addPass(vignette);
  composer.addPass(new OutputPass()); // tone mapping + sRGB, from the renderer's settings
  const fxaa = new FXAAPass();
  composer.addPass(fxaa);
  return {
    render() { composer.render(); },
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    },
    /** 0..1 during a time warp: the bloom flares. */
    setWarp(k) { bloom.strength = 0.55 + k * 0.9; },
    dispose() { composer.dispose(); bloom.dispose(); },
  };
}
