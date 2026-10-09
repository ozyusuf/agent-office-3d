// The realm's structure: floating platforms, pipes, cables and lights (the sky is sky.js).
// World axes: +x runs to the lower right of the screen, +z to the lower left, y is up.
// Layout follows docs/DESIGN.md section 4 (station placement from the original reference image).

import * as THREE from 'three';
import { P, MAT, rng, neon, platform, chamferOutline, pipeGeometries, merged, setGlow } from './kit.js';

/** Platforms by name, so props can be placed on them. `top` = floor height. */
// Rims are thin accent lines drawn below the bloom threshold (light is information, D50); the slit
// lights under the rims are warm practical lights.
export const PLATFORMS = {
  main: { x: 0, z: 0, w: 9.6, d: 9.6, top: 0, h: 0.9, chamfer: 1.8, rim: P.neonCyan, rimGlow: 0.8, slits: P.fireOrange },
  west: { x: -7.0, z: 0.2, w: 3.6, d: 9.6, top: 0.35, h: 0.8, chamfer: 0.8, rim: P.neonCyan, rimGlow: 0.55, slits: P.fireOrange },
  north: { x: 0.6, z: -7.6, w: 7.0, d: 3.6, top: -0.5, h: 0.7, chamfer: 0.8, rim: P.neonCyan, rimGlow: 0.55 },
  east: { x: 7.9, z: 1.2, w: 5.2, d: 5.6, top: -1.7, h: 0.75, chamfer: 1.1, rim: P.neonCyan, rimGlow: 0.55, slits: P.fireOrange },
  south: { x: 1.0, z: 7.4, w: 3.4, d: 3.2, top: -3.4, h: 0.6, chamfer: 0.7, rim: P.neonCyan, rimGlow: 0.55 },
};

/** Warm light of the desk lamp (the light over the character). */
export const LAMP = 0xffc48a;

/**
 * @param {THREE.Scene} scene
 * @param {object} drive  live values set by realm.js from the session state (`alert`, ...)
 */
export function buildWorld(scene, drive) {
  const ticks = [];
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const slabs = Object.values(PLATFORMS).map((spec) => platform(spec));
  group.add(...slabs);
  Object.values(PLATFORMS).forEach((spec, i) => slabs[i].add(island(spec, i)));
  group.add(bridges());
  group.add(pipes());
  group.add(cables());
  const { lights, ambient } = addLights(scene);
  ticks.push(alertRims(slabs, drive));

  // The camera frames the main platform (realm.js); the others may run off the window edges.
  const m = PLATFORMS.main;
  const fit = chamferOutline(m.w, m.d, m.chamfer).map(([x, z]) => new THREE.Vector3(m.x + x, m.top, m.z + z));
  return { group, ticks, fit, lights, ambient };
}

// StopFailure: a red pulse runs over every platform rim (on top of the normal neon strip).
function alertRims(slabs, drive) {
  const material = new THREE.MeshBasicMaterial({
    color: P.alertRed, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const rims = slabs.map((slab) => {
    const rim = new THREE.Mesh(slab.userData.rim.geometry, material);
    rim.scale.set(1.004, 1.6, 1.004);
    rim.visible = false;
    slab.add(rim);
    return rim;
  });
  return (t) => {
    const on = drive.alert > 0.01;
    for (const rim of rims) rim.visible = on;
    if (on) setGlow(material, P.alertRed, drive.alert * (2.2 + 2.0 * Math.max(0, Math.sin(t * Math.PI * 1.6))));
  };
}

// The rock each platform floats on: an upside-down mountain of flat-shaded facets, darker towards
// its tip, with a few crystals in the accent colour catching the light.
const ROCK = solidRock();
function island({ w, d, h }, seed) {
  const g = new THREE.Group();
  g.position.y = -h - 0.06;
  const rand = rng(300 + seed * 17);
  const depth = 0.55 * Math.min(w, d) + 1.4;
  const geo = new THREE.ConeGeometry(1, 1, 10, 5);
  geo.rotateX(Math.PI); // tip down
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const top = new THREE.Color(0x4a4f66);
  const tip = new THREE.Color(0x1c1e2c);
  const jitters = new Map(); // same point (the cone's seam) -> same jitter, so the rock has no cracks
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = 0.5 - y; // 0 = top (under the slab), 1 = tip
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!jitters.has(key)) jitters.set(key, { r: 0.86 + rand() * 0.28, y: (rand() - 0.5) * 0.08, bright: rand() < 0.35 });
    const j = jitters.get(key);
    const r = Math.hypot(x, z);
    const inner = t > 0.01 && t < 0.99;
    const radius = t <= 0.01 ? 1 : (1 - t) ** 0.85 * (inner ? j.r : 1);
    const s = r > 1e-6 ? radius / r : 0;
    pos.setXYZ(i, x * s * 0.47 * w, (-t + (inner ? j.y : 0)) * depth, z * s * 0.47 * d);
    c.copy(top).lerp(tip, Math.min(1, t * 1.15)); // lighter strata on top, dark towards the tip
    if (j.bright && t > 0.05 && t < 0.3) c.multiplyScalar(1.18);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const rock = new THREE.Mesh(geo.toNonIndexed(), ROCK);
  rock.geometry.computeVertexNormals();
  g.add(rock);
  geo.dispose();
  // Crystals growing out of the rock.
  const shards = [];
  for (let i = 0; i < 3 + Math.round(rand() * 2); i++) {
    const a = rand() * Math.PI * 2;
    const t = 0.25 + rand() * 0.45;
    const shard = new THREE.ConeGeometry(0.07 + rand() * 0.07, 0.4 + rand() * 0.5, 5);
    shard.translate(0, 0.25, 0);
    shard.rotateZ(Math.PI / 2 + 0.5 + rand() * 0.6); // pointing outwards and down
    shard.rotateY(-a);
    const rr = (1 - t) ** 0.85 * 0.5 * 0.92;
    shard.translate(Math.cos(a) * rr * w, -t * depth, Math.sin(a) * rr * d);
    shards.push(shard);
  }
  g.add(merged(shards, neon(P.neonCyanSoft, 0.9)));
  return g;
}

function solidRock() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05, envMapIntensity: 0.35 });
}

// Short ramp and step between platforms.
function bridges() {
  const g = new THREE.Group();
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.4), MAT.hull);
  ramp.position.set(5.35, -0.85, 0.9);
  ramp.rotation.z = -0.62;
  g.add(ramp);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 2.2), MAT.hull);
  step.position.set(-5.0, 0.0, 1.8);
  g.add(step);
  return g;
}

function pipes() {
  const geos = [];
  const add = (pts, r = 0.13, opts) => geos.push(...pipeGeometries(pts, r, opts));

  // Elbows coming out of the main platform's camera-facing sides.
  add([[3.4, -0.5, 4.95], [3.4, -0.5, 5.7], [3.4, -1.8, 5.7], [3.4, -1.8, 7.6], [3.4, -11, 7.6]], 0.15);
  add([[4.95, -0.55, -3.0], [5.9, -0.55, -3.0], [5.9, -2.8, -3.0], [5.9, -2.8, -5.0], [5.9, -11, -5.0]], 0.13);
  add([[-2.2, -0.6, 4.95], [-2.2, -0.6, 6.4], [-2.2, -1.6, 6.4], [-2.2, -1.6, 9.8]], 0.12);
  // main -> east, under the ramp
  add([[4.95, -0.4, 2.8], [6.6, -0.4, 2.8], [6.6, -1.75, 2.8]], 0.17);
  // feed pipe of the south data fall (main side -> outlet above the basin)
  add([[1.0, -0.45, 4.95], [1.0, -0.45, 6.75], [1.0, -0.95, 6.75]], 0.18, { bend: 0.4 });

  // Stack that carries the small portal ring.
  add([[-8.6, 0.35, -0.1], [-8.6, 4.5, -0.1]], 0.14);
  // L-shaped pipes at the back right, feeding the orbit pedestal and the north fall tower.
  add([[-2.6, -0.5, -8.9], [-2.6, 2.0, -8.9], [-1.2, 2.0, -8.9]], 0.17);
  add([[4.6, -6, -7.6], [4.6, 1.6, -7.6], [2.05, 1.6, -7.6]], 0.16);

  const g = new THREE.Group();
  g.add(merged(geos, MAT.pipe));
  return g;
}

// Sagging cable bundles between platforms.
function cables() {
  const geos = [];
  const sag = (a, b, drop, r = 0.035) => {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    mid.y -= drop;
    geos.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, r, 5, false));
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  sag(v(-4.8, -0.65, 3.8), v(-0.6, -3.3, 6.2), 1.2);
  sag(v(-4.8, -0.75, 3.6), v(-0.7, -3.35, 6.5), 1.6, 0.03);
  sag(v(4.85, -0.75, 0.0), v(5.6, -2.05, -1.1), 0.6);
  sag(v(2.2, -0.85, -4.85), v(2.6, -0.85, -5.8), 0.5, 0.05);
  return merged(geos, MAT.pipeDark);
}

function addLights(scene) {
  // Colours and intensities of these three follow the time of day (realm.js, sky.js).
  const hemi = new THREE.HemisphereLight(0x34425f, 0x08070c, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xb6c3e4, 0.85); // moonlight / sunlight
  key.position.set(6, 12, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x56649a, 0.3);
  fill.position.set(-4, 3, 8);
  scene.add(fill);

  // Station lights by station key; realm.js brightens them while their station works.
  const lights = {};
  for (const [key, x, y, z, color, intensity, range] of [
    ['desk', 1.3, 3.2, 1.3, LAMP, 9, 10], // the desk lamp, in front of the character
    ['editor', -1.9, 3.0, 2.6, P.fireOrange, 9, 7],
    ['board', 0.3, 2.8, -2.6, P.neonBlue, 12, 9],
    ['centrifuge', 7.9, 1.0, 1.2, P.neonMagenta, 12, 9],
    ['racks', -6.2, 2.6, 0.6, P.neonPurple, 10, 9], // racks + arcade
  ]) {
    const light = new THREE.PointLight(color, intensity, range, 1.6);
    light.position.set(x, y, z);
    scene.add(light);
    lights[key] = { light, base: intensity };
  }
  return { lights, ambient: { hemi, key, fill } };
}

/** Image-based lighting: a tiny procedural "room" of neon panels, so metal reflects colour. */
export function neonEnvironment(renderer, accent = P.neonCyan, ceiling = 0x2a3d70) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x02030a);
  const panel = (color, intensity, pos, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide,
    }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(ceiling, 1.0, [0, 9, 0], 18, 18); // the sky above
  panel(accent, 1.8, [5, 3, 5], 6, 1.5);
  panel(0x5a6a9a, 1.0, [-6, 3, -2], 2, 6);
  panel(P.neonPurple, 0.8, [2, 2, -7], 7, 2);
  panel(LAMP, 1.6, [-4, -1, 6], 3, 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  return target.texture;
}
