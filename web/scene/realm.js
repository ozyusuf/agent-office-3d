// The 3D realm behind the HUD: renderer, isometric camera, optional bloom, render loop.
// Performance (docs/DESIGN.md): pixel-ratio cap, no shadows, shared materials, bloom can be turned
// off, at most ~60 fps, and nothing is drawn while the tab is hidden.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, neonEnvironment } from './world.js';
import { buildProps, DESK_POS, DAIS_TOP } from './props.js';
import { buildCharacter } from './character.js';

const ELEVATION = THREE.MathUtils.degToRad(35); // camera looks down 35°
const YAW = Math.PI / 4; // and from 45° (+x +z), so axis-aligned platforms read as diamonds
const DISTANCE = 60;
// Skip display frames that come sooner than this: 120/144 Hz screens draw at 60/72 fps, while a
// 60 Hz screen (whose frames arrive with a little jitter) still draws every frame.
const MIN_FRAME_MS = 1000 / 75;
// Framing inside the HUD's free middle area: the main platform takes at most this share of its
// width, and the scene from the top portal down to the lower data-fall basin at most this share of
// its height. Side platforms may run off the window edges, as in the reference image.
const FIT_WIDTH = 0.78;
const FIT_HEIGHT = 1.0;

/**
 * @param {HTMLElement} container  full-window element that receives the canvas
 * @param {{ bloom?: boolean, pixelRatioCap?: number, getViewRect: () => DOMRect, onFrame?: () => void }} options
 */
export function createRealm(container, options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = neonEnvironment(renderer);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  const viewDir = new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(YAW), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(YAW));
  aimCamera(new THREE.Vector3());

  const world = buildWorld(scene);
  const props = buildProps(scene, camera);
  const character = buildCharacter();
  character.root.position.set(DESK_POS.x - 0.15, DAIS_TOP, DESK_POS.z - 0.15);
  character.root.rotation.y = YAW;
  scene.add(character.root);
  const ticks = [...world.ticks, ...props.ticks, character.tick];

  const anchors = { ...props.anchors };
  anchors.character = character.root.localToWorld(character.headTop.clone());

  // Postprocessing: render -> bloom -> output (tone mapping + sRGB).
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  let bloom = options.bloom !== false;
  let pixelRatioCap = options.pixelRatioCap ?? 1.5;
  let size = { w: 0, h: 0 };
  let ppu = 1; // CSS pixels per world unit

  function aimCamera(target) {
    camera.position.copy(target).addScaledVector(viewDir, DISTANCE);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  /** Min/max of points projected on an axis. */
  function span(points, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      const d = p.dot(axis);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    return { size: max - min, mid: (min + max) / 2 };
  }

  /** Fit the scene into the HUD's free middle area (see FIT_WIDTH / FIT_HEIGHT). */
  function frame() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    // MSAA on the bloom path costs a lot of fill rate at high resolution, where jagged edges
    // show least; so it is only used below 1.5x. (Without bloom the canvas has its own MSAA.)
    const samples = pr < 1.5 ? 4 : 0;
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose(); // re-created with the new sample count on next use
      }
    }
    size = { w, h };

    const rect = options.getViewRect();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const across = span(world.fit, right); // main platform, left to right
    const tall = span(props.bounds, up); // top portal to lower basin
    ppu = Math.min((rect.width * FIT_WIDTH) / across.size, (rect.height * FIT_HEIGHT) / tall.size);
    camera.left = -w / 2 / ppu;
    camera.right = w / 2 / ppu;
    camera.top = h / 2 / ppu;
    camera.bottom = -h / 2 / ppu;
    camera.updateProjectionMatrix();
    // Centre both spans on the free area (screen y grows downwards, camera y upwards).
    const dx = (rect.left + rect.width / 2 - w / 2) / ppu;
    const dy = -(rect.top + rect.height / 2 - h / 2) / ppu;
    aimCamera(right.multiplyScalar(across.mid - dx).add(up.multiplyScalar(tall.mid - dy)));
    // Fog: things far below and far behind the platforms fade into the void.
    scene.fog.near = DISTANCE + 2;
    scene.fog.far = DISTANCE + 13;
  }

  // ---- Loop ----

  let running = false;
  let last = 0;
  let elapsed = 0;
  let frames = 0;
  let fpsWindow = 0;
  let fps = 0;

  function render(now) {
    if (now - last < MIN_FRAME_MS) return;
    const dt = Math.min((now - last) / 1000, 0.1); // no jump after a pause
    last = now;
    elapsed += dt;
    for (const tick of ticks) tick(elapsed, dt);
    renderer.info.reset(); // count every pass of this frame (autoReset is off)
    if (bloom) composer.render(dt);
    else renderer.render(scene, camera);
    options.onFrame?.();
    frames++;
    if (now - fpsWindow >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsWindow));
      frames = 0;
      fpsWindow = now;
    }
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    fpsWindow = last;
    frames = 0;
    renderer.setAnimationLoop(render);
  }

  function stop() {
    running = false;
    fps = 0;
    renderer.setAnimationLoop(null);
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('resize', frame);
  frame();
  start();

  const point = new THREE.Vector3();
  return {
    anchors,
    /** World point -> CSS pixel position in the window. */
    project(world) {
      point.copy(world).project(camera);
      return { x: (point.x + 1) * size.w / 2, y: (1 - point.y) * size.h / 2 };
    },
    reframe: frame,
    /** Current scene scale: CSS pixels per world unit. */
    pixelsPerUnit: () => ppu,
    setBloom(on) { bloom = on; },
    setPixelRatioCap(cap) {
      pixelRatioCap = cap;
      frame();
    },
    stats() {
      return {
        fps, running, bloom, pixelRatio: renderer.getPixelRatio(),
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      };
    },
  };
}
