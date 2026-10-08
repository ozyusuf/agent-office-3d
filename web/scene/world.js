// The realm's structure: floating platforms, pipes, cables, background haze, dust and lights.
// World axes: +x runs to the lower right of the screen, +z to the lower left, y is up.
// Layout follows docs/DESIGN.md section 4 (positions as seen in docs/design/reference.png).

import * as THREE from 'three';
import { P, FACE_CAMERA, rng, MAT, TEX, platform, chamferOutline, pipeGeometries, merged, glowSprite } from './kit.js';

/** Platforms by name, so props can be placed on them. `top` = floor height. */
export const PLATFORMS = {
  main: { x: 0, z: 0, w: 9.6, d: 9.6, top: 0, h: 0.9, chamfer: 1.8, rim: P.neonCyan, slits: P.fireOrange },
  west: { x: -7.0, z: 0.2, w: 3.6, d: 9.6, top: 0.35, h: 0.8, chamfer: 0.8, rim: P.neonMagenta, slits: P.neonCyan },
  north: { x: 0.6, z: -7.6, w: 7.0, d: 3.6, top: -0.5, h: 0.7, chamfer: 0.8, rim: P.neonCyan },
  east: { x: 7.9, z: 1.2, w: 5.2, d: 5.6, top: -1.7, h: 0.75, chamfer: 1.1, rim: P.neonMagenta, slits: P.neonCyan },
  south: { x: 1.0, z: 7.4, w: 3.4, d: 3.2, top: -3.4, h: 0.6, chamfer: 0.7, rim: P.neonCyan },
};

export function buildWorld(scene) {
  const ticks = [];
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  for (const spec of Object.values(PLATFORMS)) group.add(platform(spec));
  group.add(bridges());
  group.add(pipes());
  group.add(cables());
  addBackground(scene, group, ticks);
  addLights(scene);

  // The camera frames the main platform (realm.js); the others may run off the window edges.
  const m = PLATFORMS.main;
  const fit = chamferOutline(m.w, m.d, m.chamfer).map(([x, z]) => new THREE.Vector3(m.x + x, m.top, m.z + z));
  return { group, ticks, fit };
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
  const dark = [];
  const add = (pts, r = 0.13, opts) => geos.push(...pipeGeometries(pts, r, opts));
  const addDark = (pts, r = 0.13, opts) => dark.push(...pipeGeometries(pts, r, opts));

  // Columns under the platforms, dropping into the void (fog swallows the ends).
  for (const [x, z, top, r] of [
    [-2.6, 2.6, -1.0, 0.26], [2.8, -2.4, -1.0, 0.3], [3.4, 3.0, -1.0, 0.18],
    [-7.0, 3.4, -0.5, 0.22], [8.0, 2.0, -2.5, 0.24], [1.2, 7.6, -4.0, 0.18], [0.9, -7.4, -1.2, 0.2],
  ]) addDark([[x, top, z], [x, top - 11, z]], r, { flanges: false });

  // Elbows coming out of the main platform's camera-facing sides.
  add([[3.4, -0.5, 4.95], [3.4, -0.5, 5.7], [3.4, -1.8, 5.7], [3.4, -1.8, 7.6], [3.4, -11, 7.6]], 0.15);
  add([[4.95, -0.55, -3.0], [5.9, -0.55, -3.0], [5.9, -2.8, -3.0], [5.9, -2.8, -5.0], [5.9, -11, -5.0]], 0.13);
  add([[-2.2, -0.6, 4.95], [-2.2, -0.6, 6.4], [-2.2, -1.6, 6.4], [-2.2, -1.6, 9.8]], 0.12);
  // main -> east, under the ramp
  add([[4.95, -0.4, 2.8], [6.6, -0.4, 2.8], [6.6, -1.75, 2.8]], 0.17);
  // feed pipe of the south data fall (main side -> outlet above the basin)
  add([[1.0, -0.45, 4.95], [1.0, -0.45, 6.75], [1.0, -0.95, 6.75]], 0.18, { bend: 0.4 });

  // Background stacks behind the west platform, rising out of view.
  for (const [x, z, r] of [[-9.0, -3.8, 0.22], [-8.4, -4.8, 0.15], [-9.5, -1.6, 0.17]]) {
    addDark([[x, -8, z], [x, 16, z]], r, { flanges: false });
  }
  // Stack that carries the small portal ring.
  add([[-8.6, 0.35, -0.1], [-8.6, 4.5, -0.1]], 0.14);
  // L-shaped pipes at the back right, feeding the orbit pedestal and the north fall tower.
  add([[-2.6, -0.5, -8.9], [-2.6, 2.0, -8.9], [-1.2, 2.0, -8.9]], 0.17);
  add([[4.6, -6, -7.6], [4.6, 1.6, -7.6], [2.05, 1.6, -7.6]], 0.16);

  const g = new THREE.Group();
  g.add(merged(geos, MAT.pipe));
  g.add(merged(dark, MAT.pipeDark));
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

function addBackground(scene, group, ticks) {
  scene.background = TEX.sky;
  scene.fog = new THREE.Fog(P.bgDeep, 0, 1); // range is set by the camera (realm.js)

  // Nebula haze behind the platforms.
  for (const [x, y, z, size, color, opacity] of [
    [-10, 5, -12, 24, P.neonPurple, 0.16], [6, 2, -14, 22, P.neonBlue, 0.14],
    [-2, -7, -8, 28, 0x1a3a7a, 0.16], [11, -5, 5, 16, P.neonMagenta, 0.06],
  ]) {
    const haze = glowSprite(color, size, opacity);
    haze.position.set(x, y, z);
    haze.renderOrder = -2;
    haze.material.fog = false;
    group.add(haze);
  }

  // Dust and light specks drifting upwards.
  const rand = rng(5);
  const count = 260;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [P.neonCyan, P.neonCyanSoft, P.neonMagenta, P.neonPurple, 0xffffff];
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions.set([(rand() - 0.5) * 32, -12 + rand() * 26, (rand() - 0.5) * 32], i * 3);
    color.set(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.6 + rand() * 1.4);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.2, map: TEX.glow, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  dust.frustumCulled = false;
  group.add(dust);
  ticks.push((t, dt) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + dt * (0.12 + (i % 5) * 0.04);
      if (y > 14) y -= 26;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });

  // Columns of falling glyph blocks far behind, top right (decoration).
  for (const [x, y, z, h, speed] of [[3.0, 6.5, -14, 12, 0.05], [4.8, 5.5, -13, 9, 0.08]]) {
    const tex = TEX.glyphs.clone();
    tex.repeat.set(1, h / 8);
    const column = new THREE.Mesh(new THREE.PlaneGeometry(1.0, h), new THREE.MeshBasicMaterial({
      map: tex, alphaMap: TEX.fadeV, color: new THREE.Color(P.neonCyan).multiplyScalar(1.1), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5,
    }));
    column.position.set(x, y, z);
    column.rotation.y = FACE_CAMERA;
    column.renderOrder = -1;
    group.add(column);
    ticks.push((t) => { tex.offset.y = t * speed; });
  }
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0x3a4c86, 0x07060f, 1.1));
  const key = new THREE.DirectionalLight(0x9fb2ff, 0.9);
  key.position.set(6, 12, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8a5cd6, 0.35);
  fill.position.set(-4, 3, 8);
  scene.add(fill);

  for (const [x, y, z, color, intensity, range] of [
    [1.3, 3.2, 1.3, P.neonCyan, 11, 10], // command desk, in front of the character
    [-2.5, 1.8, 2.9, P.fireOrange, 14, 8], // smelter
    [0.3, 2.8, -2.6, P.neonBlue, 12, 9], // board
    [7.9, 1.0, 1.2, P.neonMagenta, 12, 9], // centrifuge
    [-6.2, 2.6, 0.6, P.neonMagenta, 10, 9], // racks + arcade
  ]) {
    const light = new THREE.PointLight(color, intensity, range, 1.6);
    light.position.set(x, y, z);
    scene.add(light);
  }
}

/** Image-based lighting: a tiny procedural "room" of neon panels, so metal reflects colour. */
export function neonEnvironment(renderer) {
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
  panel(0x2a3d70, 1.0, [0, 9, 0], 18, 18);
  panel(P.neonCyan, 2.5, [5, 3, 5], 6, 1.5);
  panel(P.neonMagenta, 2.0, [-6, 3, -2], 2, 6);
  panel(P.neonPurple, 1.6, [2, 2, -7], 7, 2);
  panel(P.fireOrange, 1.4, [-4, -1, 6], 3, 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  return target.texture;
}
