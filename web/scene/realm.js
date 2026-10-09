// The 3D realm behind the HUD: renderer, isometric camera, optional bloom, render loop, and the
// link from the session state to the scene (docs/DESIGN.md section 5): every frame the director
// decides what should happen, and `drive` eases towards it so every change is a smooth transition.
// Performance (docs/DESIGN.md): pixel-ratio cap, no shadows, shared materials, bloom can be turned
// off, at most ~60 fps, and nothing is drawn while the tab is hidden.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, neonEnvironment } from './world.js';
import { buildProps, RACK_LEDS } from './props.js';
import { buildCharacter } from './character.js';
import { buildHelpers } from './helpers.js';
import { P, ease } from './kit.js';
import { createDirector, eventRate, fallsSpeed, rackTarget, powerOf, alertOf, RATE_WINDOW_MS } from './director.js';
import { stationForKind } from '../stations.js';

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
const EXPOSURE = 1.05;
const STATION_KEYS = ['desk', 'smelter', 'board', 'centrifuge', 'orbit', 'racks', 'portal', 'arcade'];

/**
 * @param {HTMLElement} container  full-window element that receives the canvas
 * @param {{ bloom?: boolean, pixelRatioCap?: number, getViewRect: () => DOMRect, onFrame?: () => void }} options
 */
export function createRealm(container, options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.info.autoReset = false;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = neonEnvironment(renderer);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  const viewDir = new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(YAW), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(YAW));
  aimCamera(new THREE.Vector3());

  // Live values the scene reacts to; direct() sets them from the session state every frame.
  const drive = {
    act: Object.fromEntries(STATION_KEYS.map((key) => [key, 0])), // 0..1 while a station works
    sputter: Object.fromEntries(STATION_KEYS.map((key) => [key, 0])), // red flicker after a failed call
    typing: 0, // the character types at the desk
    prompt: 0, // flash of a new prompt / session start
    portalFlash: 0, // a helper came out of / went into the portal
    power: 0, // 0 = standby (no session, or it ended), 1 = running
    alert: 0, // red alert after StopFailure
    waiting: 0, // waiting for permission (yellow light)
    falls: fallsSpeed(0), // data fall speed from the activity rate
    rack: { lit: 0, flash: 0 }, // rack LEDs lit (context fill), compaction flash
    board: null, // what the board's ticker shows
  };
  const director = createDirector();
  const world = buildWorld(scene, drive);
  const props = buildProps(scene, camera, drive);
  const character = buildCharacter();
  scene.add(character.root);
  const helpers = buildHelpers(scene, { portal: props.hovers.portal, hovers: props.hovers }, () => {
    drive.portalFlash = 1;
  });
  const ticks = [...world.ticks, ...props.ticks, character.tick, helpers.tick];

  const anchors = { ...props.anchors, character: new THREE.Vector3() };
  character.headWorld(anchors.character);

  let focus = null; // the server's focus session
  let contextBarMax = 150;
  const times = []; // hook times of recent events, for the activity rate

  /** Session state -> drive values (eased), character goal, exposure and station lights. */
  function direct(dt) {
    const now = Date.now();
    const goal = director.character(focus, now);
    character.setGoal(goal);
    const on = director.stations(focus, now);
    for (const key of STATION_KEYS) {
      const want = on.has(key) ? 1 : 0;
      // Quick to start, about a second to settle back to idle.
      drive.act[key] = ease(drive.act[key], want, dt, want > drive.act[key] ? 0.12 : 0.4);
      drive.sputter[key] = Math.max(0, drive.sputter[key] - dt / 0.9);
    }
    drive.typing = ease(drive.typing, character.pose() === 'type' ? 1 : 0, dt, 0.2);
    drive.prompt = Math.max(0, drive.prompt - dt / 1.2);
    drive.portalFlash = Math.max(0, drive.portalFlash - dt / 0.8);
    drive.power = ease(drive.power, powerOf(focus), dt, 0.5);
    drive.alert = ease(drive.alert, alertOf(focus), dt, 0.35);
    drive.waiting = ease(drive.waiting, focus?.status === 'waiting' ? 1 : 0, dt, 0.3);
    while (times.length && now - times[0] > RATE_WINDOW_MS) times.shift();
    drive.falls = ease(drive.falls, fallsSpeed(eventRate(times, now)), dt, 1.5);
    // LEDs fill and drain at most 96 per second (a full drain takes 1.5 s).
    const lit = rackTarget(focus, contextBarMax, RACK_LEDS);
    drive.rack.lit += Math.sign(lit - drive.rack.lit) * Math.min(Math.abs(lit - drive.rack.lit), dt * 96);
    drive.rack.flash = ease(drive.rack.flash, focus?.compacting ? 1 : 0, dt, 0.25);
    drive.board = director.board(focus);
    // Standby and "lights out" dim the whole scene; the red alert rims stay bright.
    renderer.toneMappingExposure = EXPOSURE * (0.42 + 0.58 * drive.power) * (1 - 0.6 * drive.alert);
    for (const [key, { light, base }] of Object.entries(world.lights)) {
      const a = key === 'racks' ? Math.max(drive.act.racks, drive.act.arcade) : drive.act[key];
      light.intensity = base * (0.8 + 0.6 * a);
    }
    // Waiting for permission: the light over the desk turns yellow (with the HUD's yellow tint).
    const desk = world.lights.desk;
    desk.light.color.setHex(P.neonCyan).lerp(warnYellow, drive.waiting);
    desk.light.intensity *= (1 + 0.8 * drive.waiting * (0.6 + 0.4 * Math.sin(now / 160)));
  }
  const warnYellow = new THREE.Color(P.warnYellow);

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
    direct(dt);
    for (const tick of ticks) tick(elapsed, dt);
    character.headWorld(anchors.character);
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
    /** Server snapshot ({ stats, liveSessions, focus }) and config, after every event. */
    setState(state, config) {
      focus = state?.focus ?? null;
      if (config?.contextBarMax > 0) contextBarMax = config.contextBarMax;
      helpers.sync(focus && focus.status !== 'ended' ? focus.helpers : []);
    },
    /** Events replayed on connect: only used for the activity rate (no reactions). */
    seed(events) {
      times.length = 0;
      for (const e of events) times.push(e.hookTs);
      times.sort((a, b) => a - b);
    },
    /** A live event: short reactions that the state alone does not show. */
    onEvent(e) {
      times.push(e.hookTs);
      director.note(e, Date.now());
      if (e.event === 'PostToolUseFailure') {
        // The station sputters out: it drops dark at once and flickers red.
        const station = stationForKind(e.kind);
        drive.sputter[station] = 1;
        drive.act[station] = Math.min(drive.act[station], 0.15);
      }
      if (e.event === 'UserPromptSubmit' || e.event === 'SessionStart') drive.prompt = 1;
    },
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
