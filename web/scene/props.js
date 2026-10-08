// Stations and decor built from primitives (docs/DESIGN.md section 4). Each builder returns
// { group, anchor, tick?, bounds? }: `anchor` is the world point its HTML label hangs from;
// `tick(t, dt)` runs ambient motion; `bounds` are points the camera keeps in view vertically.
// Stage 4 drives the stations from events; here they only idle.

import * as THREE from 'three';
import { P, TAU, FACE_CAMERA, rng, neon, solid, MAT, TEX, pipeGeometries, merged, glowSprite, flatRing } from './kit.js';
import { PLATFORMS } from './world.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** World position of a point given in a group's local space. */
function localPoint(group, x, y, z) {
  group.updateMatrixWorld(true);
  return group.localToWorld(v3(x, y, z));
}

export function buildProps(scene, camera) {
  const ticks = [];
  const anchors = {};
  const bounds = [];
  const add = (key, built) => {
    scene.add(built.group);
    if (built.anchor) anchors[key] = built.anchor;
    if (built.tick) ticks.push(built.tick);
    if (built.bounds) bounds.push(...built.bounds);
  };
  const billboard = camera.quaternion.clone();

  add('desk', commandDesk());
  add('smelter', smelter(billboard));
  add('board', visionBoard());
  add('centrifuge', centrifuge());
  add('orbit', orbitSphere());
  add('racks', serverRacks());
  add('falls', dataFalls());
  add('portal', portals());
  add('arcade', arcade());
  add('decor', decor());
  return { anchors, ticks, bounds };
}

// ---- Command desk: round dais, floating curved console, holo keyboard, laptop ----

export const DESK_POS = v3(0, 0, 0);
export const DAIS_TOP = 0.2;

function commandDesk() {
  const group = new THREE.Group();
  group.position.copy(DESK_POS);
  group.rotation.y = FACE_CAMERA;

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.64, DAIS_TOP, 56), MAT.hull);
  dais.position.y = DAIS_TOP / 2;
  group.add(dais);
  for (const [r, tube, glow, y] of [[2.48, 0.035, 2.2, DAIS_TOP + 0.005], [1.62, 0.02, 1.2, DAIS_TOP + 0.005], [3.15, 0.026, 1.1, 0.01]]) {
    const ring = flatRing(r, tube, neon(P.neonCyan, glow));
    ring.position.y = y;
    group.add(ring);
  }
  const dashes = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.3, 72), new THREE.MeshBasicMaterial({
    map: TEX.dashes, color: new THREE.Color(P.neonCyan).multiplyScalar(1.2), transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  fixRingUv(dashes.geometry, 2.3);
  dashes.rotation.x = -Math.PI / 2;
  dashes.position.y = DAIS_TOP + 0.004;
  group.add(dashes);

  // Ring console around the character, open towards the camera (local +z) so that the
  // character stays visible from the 35° view; a holo keyboard floats in the opening.
  const a0 = 0.62;
  const a1 = Math.PI * 2 - 0.62;
  const r0 = 1.2;
  const r1 = 1.65;
  const y = 1.0;
  const shape = new THREE.Shape();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    if (i === 0) shape.moveTo(r1 * Math.sin(a), -r1 * Math.cos(a));
    else shape.lineTo(r1 * Math.sin(a), -r1 * Math.cos(a));
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    shape.lineTo(r0 * Math.sin(a), -r0 * Math.cos(a));
  }
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(0, y - 0.12, 0);
  group.add(new THREE.Mesh(slabGeo, MAT.hull));
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1 - 0.16, 0.34, 64, 1, true, a0, a1 - a0), MAT.hullDark);
  skirt.position.y = y - 0.29;
  group.add(skirt);
  group.add(arcTube(r1 + 0.006, y + 0.006, a0, a1, 0.026, neon(P.neonCyan, 2.6)));
  group.add(arcTube(r1 - 0.15, y - 0.46, a0 + 0.05, a1 - 0.05, 0.018, neon(P.neonCyan, 1.6)));
  group.add(arcTube(r0 + 0.01, y + 0.006, a0, a1, 0.014, neon(P.neonCyan, 1.3)));

  const posts = [];
  for (const a of [a0 + 0.3, Math.PI, a1 - 0.3]) {
    const h = y - DAIS_TOP - 0.12;
    const post = new THREE.CylinderGeometry(0.055, 0.075, h, 10);
    post.translate(1.42 * Math.sin(a), DAIS_TOP + h / 2, 1.42 * Math.cos(a));
    posts.push(post);
  }
  group.add(merged(posts, MAT.trim));

  // Holo keyboard in the opening, and two floating holo panels at the console's ends.
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.34), new THREE.MeshBasicMaterial({
    map: keysTexture(), color: new THREE.Color(P.neonCyan).multiplyScalar(2.0), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  keys.rotation.x = -Math.PI / 2 + 0.35;
  keys.position.set(0, y - 0.05, 0.85);
  group.add(keys);
  for (const [a, w] of [[-0.9, 0.5], [0.9, 0.46]]) {
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), new THREE.MeshBasicMaterial({
      map: TEX.board, color: new THREE.Color(0xffffff).multiplyScalar(1.4), transparent: true, opacity: 0.85,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    holo.position.set(1.45 * Math.sin(a), y + 0.4, 1.45 * Math.cos(a));
    holo.rotation.set(-0.35, a, 0, 'YXZ');
    group.add(holo);
  }

  // Laptop on the console's left arm, screen towards the camera.
  const laptop = new THREE.Group();
  laptop.position.set(1.42 * Math.sin(-1.25), y, 1.42 * Math.cos(-1.25));
  laptop.rotation.y = Math.PI - 0.5;
  laptop.scale.setScalar(1.35);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.24), MAT.trim);
  base.position.y = 0.01;
  laptop.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.015), MAT.hullDark);
  lid.position.set(0, 0.12, 0.12);
  lid.rotation.x = 0.25;
  laptop.add(lid);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), neon(P.neonCyanSoft, 1.8));
  face.position.set(0, 0.12, 0.11);
  face.rotation.x = 0.25 + Math.PI;
  laptop.add(face);
  group.add(laptop);

  return {
    group,
    anchor: localPoint(group, 0, 2.0, 1.6),
    tick: (t) => { dashes.rotation.z = t * 0.15; },
  };
}

function keysTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 56;
  const g = canvas.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.strokeRect(2, 2, 124, 52);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) g.fillRect(7 + col * 10, 7 + row * 11, 7, 7);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function arcTube(radius, y, a0, a1, tube, material) {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = a0 + ((a1 - a0) * i) / 32;
    pts.push(v3(radius * Math.sin(a), y, radius * Math.cos(a)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, tube, 6, false), material);
}

/** RingGeometry UVs follow x/y; remap them so a square texture wraps the ring like a disc. */
function fixRingUv(geo, outer) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * outer) + 0.5, pos.getY(i) / (2 * outer) + 0.5);
}

// ---- Code Smelter: furnace with fire core, flames and sparks ----

function smelter(billboard) {
  const group = new THREE.Group();
  group.position.set(-2.55, 0, 2.95);
  group.rotation.y = FACE_CAMERA;

  const w = 1.6;
  const h = 0.95;
  const d = 1.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.hull);
  body.position.y = h / 2;
  group.add(body);
  const trims = [];
  for (const [sx, sz, lx, lz] of [[0, d / 2, w + 0.1, 0.1], [0, -d / 2, w + 0.1, 0.1], [w / 2, 0, 0.1, d], [-w / 2, 0, 0.1, d]]) {
    const t = new THREE.BoxGeometry(lx, 0.12, lz);
    t.translate(sx, h + 0.05, sz);
    trims.push(t);
  }
  const foot = new THREE.BoxGeometry(w + 0.16, 0.12, d + 0.16);
  foot.translate(0, 0.06, 0);
  trims.push(foot);
  group.add(merged(trims, MAT.trim));

  // Glowing bed inside the top opening, and a hot window on the front.
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.2), neon(P.fireDeep, 1.5));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = h + 0.005;
  group.add(bed);
  const hatch = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), neon(P.fireOrange, 2.0));
  hatch.position.set(-0.15, 0.5, d / 2 + 0.006);
  group.add(hatch);
  const slits = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.BoxGeometry(0.07, 0.34, 0.01);
    s.translate(-w / 2 + 0.2 + i * 0.13, 0.4, d / 2 + 0.006);
    slits.push(s);
  }
  group.add(merged(slits, solid(0x07080f, { roughness: 0.9, metalness: 0.2 })));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.1), MAT.hullDark);
  panel.position.set(0.55, 0.48, d / 2 + 0.04);
  group.add(panel);
  const panelGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), neon(P.warnYellow, 1.7));
  panelGlow.position.set(0.55, 0.48, d / 2 + 0.092);
  group.add(panelGlow);

  // Side pipes (left side, like the reference).
  const pipes = [];
  for (let i = 0; i < 3; i++) {
    const z = -0.38 + i * 0.36;
    pipes.push(...pipeGeometries([[-w / 2 - 0.15, 0.06, z], [-w / 2 - 0.15, 0.8, z], [-w / 2 + 0.05, 0.8, z]], 0.075, { bend: 0.14 }));
  }
  group.add(merged(pipes, MAT.pipe));

  // Fire: billboard flames rising from the bed, plus sparks.
  const flames = particles(16, TEX.flame, billboard);
  const sparks = particles(26, TEX.glow, billboard);
  group.add(flames.mesh, sparks.mesh);
  const halo = glowSprite(P.fireOrange, 3.4, 0.3);
  halo.position.y = h + 0.6;
  group.add(halo);

  const rand = rng(3);
  const fl = flames.items.map(() => ({ age: rand(), life: 0.7 + rand() * 0.5, x: 0, z: 0, s: 1 }));
  const sp = sparks.items.map(() => ({ age: rand(), life: 0.8 + rand() * 0.9, p: v3(0, -9, 0), v: v3(0, 0, 0) }));
  const hot = new THREE.Color();
  const ember = new THREE.Color(P.fireDeep);
  const tmp = new THREE.Vector3();

  return {
    group,
    anchor: localPoint(group, 0, 2.5, 0),
    tick(t, dt) {
      fl.forEach((f, i) => {
        f.age += dt / f.life;
        if (f.age >= 1) {
          f.age -= 1;
          f.x = (rand() - 0.5) * (w - 0.55);
          f.z = (rand() - 0.5) * (d - 0.55);
          f.s = 0.7 + rand() * 0.6;
        }
        const k = f.age;
        const size = f.s * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k * 0.4);
        tmp.set(f.x * (1 - k * 0.5), h + 0.22 + k * 1.05, f.z * (1 - k * 0.5));
        hot.setHex(k < 0.3 ? P.warnYellow : P.fireOrange).lerp(ember, Math.max(0, k - 0.35)).multiplyScalar(0.95);
        flames.set(i, tmp, size * 0.6, size * 1.1, hot);
      });
      sp.forEach((s, i) => {
        s.age += dt / s.life;
        if (s.age >= 1) {
          s.age = 0;
          s.p.set((rand() - 0.5) * 0.8, h + 0.35, (rand() - 0.5) * 0.6);
          s.v.set((rand() - 0.5) * 1.8, 1.6 + rand() * 1.6, (rand() - 0.5) * 1.8);
        }
        s.v.y -= dt * 2.4;
        s.p.addScaledVector(s.v, dt);
        const size = 0.08 * (1 - s.age);
        hot.setHex(P.warnYellow).multiplyScalar(3 * (1 - s.age));
        sparks.set(i, s.p, size, size, hot);
      });
      flames.commit();
      sparks.commit();
      halo.material.opacity = 0.28 + 0.05 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23);
    },
  };
}

/** Camera-facing quads in one InstancedMesh (fire, sparks). */
function particles(count, map, billboard) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  let local = null;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  return {
    mesh,
    items: Array.from({ length: count }),
    set(i, position, sx, sy, color) {
      // Undo the (static) parent rotation so every quad faces the fixed camera.
      local ??= mesh.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(billboard);
      m.compose(position, local, s.set(Math.max(sx, 1e-4), Math.max(sy, 1e-4), 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color);
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---- Vision & Task Board: large curved holo screen ----

function visionBoard() {
  const group = new THREE.Group();
  group.position.set(0.5, 0, -3.8);
  group.rotation.y = FACE_CAMERA;

  const R = 5.5;
  const half = 0.43;
  const H = 2.6;
  const yMid = 2.85;
  const geo = new THREE.CylinderGeometry(R, R, H, 40, 1, true, Math.PI - half, 2 * half);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // seen from inside: un-mirror
  geo.translate(0, yMid, R);
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: TEX.board, color: new THREE.Color(0xffffff).multiplyScalar(1.3), transparent: true, opacity: 0.93,
    side: THREE.DoubleSide, depthWrite: false,
  })));

  const edge = (y) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - half + (2 * half * i) / 24;
      pts.push(v3(R * Math.sin(a), y, R * Math.cos(a) + R));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.032, 6, false);
  };
  const frame = [edge(yMid + H / 2), edge(yMid - H / 2)];
  for (const s of [-1, 1]) {
    const bar = new THREE.CylinderGeometry(0.034, 0.034, H, 6);
    bar.translate(s * R * Math.sin(half), yMid, R - R * Math.cos(half));
    frame.push(bar);
  }
  group.add(merged(frame, neon(P.neonCyan, 2.6)));

  // Stand: two posts to the floor and a projector base.
  const posts = [];
  for (const x of [-1.6, 1.6]) {
    const post = new THREE.CylinderGeometry(0.06, 0.08, yMid - H / 2, 10);
    post.translate(x, (yMid - H / 2) / 2, R - Math.sqrt(R * R - x * x));
    posts.push(post);
  }
  const base = new THREE.BoxGeometry(3.4, 0.16, 0.5);
  base.translate(0, 0.08, 0.15);
  posts.push(base);
  group.add(merged(posts, MAT.trim));
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.035, 0.05), neon(P.neonCyan, 2.4));
  beam.position.set(0, 0.17, 0.41);
  group.add(beam);
  const glow = glowSprite(P.neonBlue, 6, 0.3);
  glow.position.set(0, yMid, 0.1);
  group.add(glow);

  return { group, anchor: localPoint(group, 1.1, yMid + H / 2 + 0.2, 0.2) };
}

// ---- Test Centrifuge: three nested gimbal rings on a base ----

function centrifuge() {
  const p = PLATFORMS.east;
  const group = new THREE.Group();
  group.position.set(p.x, p.top, p.z);
  group.rotation.y = FACE_CAMERA;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.56, 0.4, 44), MAT.hull);
  base.position.y = 0.2;
  group.add(base);
  const baseRim = flatRing(1.41, 0.035, neon(P.neonMagenta, 2.6));
  baseRim.position.y = 0.405;
  group.add(baseRim);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 44), new THREE.MeshBasicMaterial({
    map: TEX.ripple, color: new THREE.Color(P.neonCyan).multiplyScalar(1.3), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.41;
  group.add(disc);

  const cy = 2.5;
  const yoke = [];
  for (const s of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.08, 0.11, cy - 0.4, 10);
    post.translate(s * 2.15, 0.4 + (cy - 0.4) / 2, 0);
    yoke.push(post);
    const foot = new THREE.CylinderGeometry(0.2, 0.26, 0.4, 12);
    foot.translate(s * 2.15, 0.2, 0);
    yoke.push(foot);
    const cap = new THREE.SphereGeometry(0.14, 12, 8);
    cap.translate(s * 2.15, cy, 0);
    yoke.push(cap);
  }
  group.add(merged(yoke, MAT.trim));

  const outer = new THREE.Group();
  outer.position.y = cy;
  group.add(outer);
  outer.add(new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.075, 10, 96), neon(P.neonMagenta, 2.6)));
  const middle = new THREE.Group();
  outer.add(middle);
  middle.add(new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.065, 10, 80), neon(P.neonCyan, 2.5)));
  const inner = new THREE.Group();
  middle.add(inner);
  inner.add(new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 10, 72), neon(P.warnYellow, 2.4)));
  outer.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), neon(P.neonCyanSoft, 1.5)));
  outer.add(glowSprite(P.neonCyan, 1.8, 0.4));

  return {
    group,
    anchor: localPoint(group, 0.8, cy + 2.3, 0), // above the rings, a little to the right
    tick(t) {
      // The outer ring stays roughly upright towards the camera; the inner two spin.
      outer.rotation.x = Math.sin(t * 0.5) * 0.3;
      outer.rotation.y = Math.sin(t * 0.37) * 0.35;
      middle.rotation.y = t * 0.6;
      inner.rotation.x = t * 0.9;
      inner.rotation.z = t * 0.4;
    },
  };
}

// ---- Orbit Sphere: glowing planet with two tilted rings, on a pipe pedestal ----

function orbitSphere() {
  const group = new THREE.Group();
  group.position.set(-2.4, PLATFORMS.north.top, -7.8);

  const ped = pipeGeometries([[0, 0, 0], [0, 2.6, 0]], 0.18, { flanges: true });
  const cup = new THREE.CylinderGeometry(0.55, 0.26, 0.32, 24);
  cup.translate(0, 2.74, 0);
  ped.push(cup);
  group.add(merged(ped, MAT.pipe));
  const cupRim = flatRing(0.55, 0.028, neon(P.neonCyan, 2.4));
  cupRim.position.y = 2.9;
  group.add(cupRim);

  const sphereY = 3.95;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.66, 40, 24), new THREE.MeshBasicMaterial({
    map: TEX.planet, color: new THREE.Color(0xffffff).multiplyScalar(1.5),
  }));
  planet.position.y = sphereY;
  group.add(planet);
  const atmo = glowSprite(P.neonBlue, 2.8, 0.7);
  atmo.position.y = sphereY;
  group.add(atmo);

  const rings = [];
  for (const [r, color, tilt, roll] of [[1.3, P.fireOrange, 1.25, 0.35], [1.55, P.neonCyan, 1.05, -0.45]]) {
    const ring = new THREE.Group();
    ring.position.y = sphereY;
    ring.rotation.set(tilt, 0, roll);
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96), neon(color, 2.4)));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), neon(color, 2.8));
    ring.add(moon);
    group.add(ring);
    rings.push({ moon, r });
  }

  return {
    group,
    anchor: localPoint(group, 0, sphereY + 1.6, 0),
    tick(t) {
      planet.rotation.y = t * 0.25;
      rings.forEach(({ moon, r }, i) => {
        const a = t * (0.5 + i * 0.3) + i * 2;
        moon.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      });
    },
  };
}

// ---- Server racks: three tall cabinets with LED rows (unlit until stage 4 drives them) ----

function serverRacks() {
  const p = PLATFORMS.west;
  const group = new THREE.Group();
  const H = 3.6;
  const W = 1.25;
  const D = 1.0;
  const zs = [-3.6, -2.35, -1.1];
  const x = -7.8;
  const front = new THREE.MeshStandardMaterial({ map: TEX.rack, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.6 });
  const side = MAT.hullDark;
  const strips = [];
  const rows = 16;
  const cols = 3;
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.04, 0.12), new THREE.MeshBasicMaterial(), zs.length * rows * cols);
  const m = new THREE.Matrix4();
  const off = new THREE.Color(0x16424e);
  let n = 0;
  for (const z of zs) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(D, H, W), [front, side, side, side, side, side]);
    cab.position.set(x, p.top + H / 2, z);
    group.add(cab);
    for (const dz of [-W / 2, W / 2]) {
      const s = new THREE.BoxGeometry(0.035, H - 0.1, 0.035);
      s.translate(x + D / 2 + 0.01, p.top + H / 2, z + dz);
      strips.push(s);
    }
    const top = new THREE.BoxGeometry(0.035, 0.035, W - 0.05);
    top.translate(x + D / 2 + 0.01, p.top + H - 0.02, z);
    strips.push(top);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        m.makeTranslation(x + D / 2 + 0.006, p.top + 0.35 + row * 0.19, z + 0.06 + col * 0.17);
        leds.setMatrixAt(n, m);
        leds.setColorAt(n, off);
        n++;
      }
    }
    const power = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), neon(P.okGreen, 3));
    power.position.set(x + D / 2 + 0.01, p.top + H - 0.18, z - 0.42);
    group.add(power);
  }
  group.add(leds);
  group.add(merged(strips, neon(P.neonCyan, 2.0)));
  return { group, anchor: v3(x, p.top + H + 0.6, zs[1]) };
}

// ---- Data falls: two cyan waterfalls pouring into glowing basins ----

function dataFalls() {
  const group = new THREE.Group();
  const ticks = [];

  const fall = (x, yTop, yBottom, z, width) => {
    const h = yTop - yBottom;
    for (const [w, intensity, opacity, speed] of [[width, 2.0, 0.95, 0.55], [width * 2.0, 1.1, 0.4, 0.38]]) {
      const tex = TEX.falls.clone();
      tex.repeat.set(w / 0.7, h / 1.8);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, alphaMap: TEX.fadeV, color: new THREE.Color(P.neonCyan).multiplyScalar(intensity), opacity,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      mesh.position.set(x, (yTop + yBottom) / 2, z);
      mesh.rotation.y = FACE_CAMERA;
      group.add(mesh);
      ticks.push((t) => { tex.offset.y = t * speed; });
    }
    const splash = glowSprite(P.neonCyan, 1.8, 0.6);
    splash.position.set(x, yBottom + 0.1, z);
    group.add(splash);
  };

  const basin = (x, y, z, r) => {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.34, 40), MAT.hull);
    tub.position.set(x, y + 0.17, z);
    group.add(tub);
    const rim = flatRing(r, 0.038, neon(P.neonCyan, 2.6));
    rim.position.set(x, y + 0.35, z);
    group.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.06, 40), new THREE.MeshBasicMaterial({
      map: TEX.ripple, color: new THREE.Color(P.neonCyan).multiplyScalar(1.5), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y + 0.32, z);
    group.add(water);
    ticks.push((t) => { water.rotation.z = -t * 0.4; });
  };

  // South fall: from the pipe outlet under the main platform into a basin far below.
  const s = PLATFORMS.south;
  const low = v3(1.0, s.top, 6.85);
  basin(low.x, low.y, low.z, 1.0);
  fall(low.x, -1.0, low.y + 0.32, low.z, 0.6);

  // North fall: from a tower with a glowing pool on top.
  const n = PLATFORMS.north;
  const tower = v3(1.4, n.top, -7.6);
  const tH = 4.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, tH, 1.25), MAT.hull);
  body.position.set(tower.x, tower.y + tH / 2, tower.z);
  group.add(body);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 1.45), MAT.trim);
  lip.position.set(tower.x, tower.y + tH, tower.z);
  group.add(lip);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({
    map: TEX.ripple, color: new THREE.Color(P.neonCyan).multiplyScalar(0.9),
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(tower.x, tower.y + tH + 0.095, tower.z);
  group.add(pool);
  const fount = glowSprite(P.neonCyan, 2.0, 0.45);
  fount.position.set(tower.x, tower.y + tH + 0.45, tower.z);
  group.add(fount);
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), MAT.trim);
  spout.position.set(tower.x + 0.66, tower.y + tH - 0.45, tower.z + 0.66);
  spout.rotation.y = FACE_CAMERA;
  group.add(spout);
  const fx = tower.x + 0.85;
  const fz = tower.z + 0.85;
  basin(fx, n.top, fz, 0.8);
  fall(fx, tower.y + tH - 0.5, n.top + 0.32, fz, 0.6);

  return {
    group,
    anchor: v3(fx, tower.y + tH + 0.8, fz),
    bounds: [low.clone()], // the lower basin (its front may hide behind the Hook Flow panel)
    tick: (t, dt) => { for (const f of ticks) f(t, dt); },
  };
}

// ---- Portal rings: a big one floating above the racks, a small one on a pipe ----

function portals() {
  const group = new THREE.Group();
  const spinners = [];
  const ring = (x, y, z, r, outer, innerColor) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(flatRing(r, r * 0.045, neon(outer, 2.7)));
    g.add(flatRing(r * 0.88, r * 0.016, neon(P.neonPurple, 2.2)));
    g.add(flatRing(r * 0.7, r * 0.022, neon(innerColor, 2.5)));
    const dash = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r * 0.86, 64), new THREE.MeshBasicMaterial({
      map: TEX.dashes, color: new THREE.Color(innerColor).multiplyScalar(1.8), transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    fixRingUv(dash.geometry, r * 0.86);
    dash.rotation.x = -Math.PI / 2;
    g.add(dash);
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 40), new THREE.MeshBasicMaterial({
      map: TEX.glow, color: new THREE.Color(outer).multiplyScalar(0.9), transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    core.rotation.x = -Math.PI / 2;
    g.add(core);
    group.add(g);
    spinners.push({ g, dash, y });
  };
  const big = v3(-4.4, 5.1, -4.2);
  ring(big.x, big.y, big.z, 2.0, P.neonMagenta, P.neonCyan);
  ring(-8.6, 4.67, -0.1, 0.85, P.neonPurple, P.neonMagenta);

  return {
    group,
    anchor: v3(big.x, big.y + 1.0, big.z),
    bounds: [big.clone().add(v3(-1.5, 0.3, -1.5))], // far rim of the big ring
    tick(t) {
      spinners.forEach(({ g, dash, y }, i) => {
        dash.rotation.z = t * (i ? -0.5 : 0.3);
        g.position.y = y + Math.sin(t * 0.8 + i * 2) * 0.08;
      });
    },
  };
}

// ---- Arcade cabinet (the character plays here when idle, stage 4) ----

function arcade() {
  const p = PLATFORMS.west;
  const group = new THREE.Group();
  group.position.set(-7.25, p.top, 1.65);
  group.rotation.y = Math.PI / 2 - 0.15;
  group.scale.setScalar(1.3);

  const bodyMat = solid(0x2a1442, { roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.85, 0.72), bodyMat);
  body.position.y = 0.925;
  group.add(body);
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.16), neon(P.neonMagenta, 2.4));
  marquee.position.set(0, 1.82, 0.3);
  group.add(marquee);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.58, 0.04), solid(0x0b0614, { roughness: 0.7, metalness: 0.2 }));
  bezel.position.set(0, 1.32, 0.35);
  bezel.rotation.x = -0.12;
  group.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.48), new THREE.MeshBasicMaterial({
    map: TEX.arcade, color: new THREE.Color(0xffffff).multiplyScalar(1.7),
  }));
  screen.position.set(0, 1.32, 0.375);
  screen.rotation.x = -0.12;
  group.add(screen);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.36), bodyMat);
  deck.position.set(0, 0.95, 0.46);
  deck.rotation.x = 0.35;
  group.add(deck);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), MAT.trim);
  stick.position.set(-0.2, 1.06, 0.46);
  group.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), neon(P.alertRed, 1.6));
  ball.position.set(-0.2, 1.14, 0.46);
  group.add(ball);
  [P.neonCyan, P.warnYellow, P.neonMagenta].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), neon(c, 2.2));
    b.position.set(0.05 + i * 0.11, 1.0, 0.47);
    b.rotation.x = 0.35;
    group.add(b);
  });
  const edges = [];
  for (const sx of [-0.41, 0.41]) {
    const e = new THREE.BoxGeometry(0.02, 1.85, 0.02);
    e.translate(sx, 0.925, 0.37);
    edges.push(e);
  }
  group.add(merged(edges, neon(P.neonMagenta, 2.2)));
  const glow = glowSprite(P.neonMagenta, 1.8, 0.35);
  glow.position.set(0, 1.4, 0.6);
  group.add(glow);

  return { group, anchor: localPoint(group, 0, 2.4, 0) };
}

// ---- Decor: plants, canister, console box ----

function decor() {
  const group = new THREE.Group();
  group.add(plant(-3.4, 0, -1.7, 1.7, 1));
  group.add(plant(-7.9, PLATFORMS.west.top, 0.35, 1.05, 2));

  const canister = new THREE.Group();
  canister.position.set(3.15, 0, 2.95);
  canister.scale.setScalar(1.25);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.55, 20), MAT.hull);
  can.position.y = 0.275;
  canister.add(can);
  const band = flatRing(0.275, 0.022, neon(P.neonCyan, 2.6));
  band.position.y = 0.42;
  canister.add(band);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 20), neon(P.neonCyanSoft, 1.6));
  lid.position.y = 0.59;
  canister.add(lid);
  group.add(canister);

  const box = new THREE.Group();
  box.position.set(2.3, 0, -2.4);
  box.scale.setScalar(1.25);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.62), MAT.hull);
  body.position.y = 0.43;
  box.add(body);
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.BoxGeometry(0.3, 0.035, 0.01);
    l.translate(0, 0.55 - i * 0.12, 0.315);
    lights.push(l);
    const l2 = new THREE.BoxGeometry(0.01, 0.035, 0.3);
    l2.translate(0.315, 0.55 - i * 0.12, 0);
    lights.push(l2);
  }
  box.add(merged(lights, neon(P.fireOrange, 2.4)));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), neon(P.neonCyan, 1.3));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.865;
  box.add(top);
  group.add(box);

  return { group };
}

function plant(x, y, z, scale, seed) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.34, 18), MAT.hullDark);
  pot.position.y = 0.17;
  g.add(pot);
  const rim = flatRing(0.24, 0.012, neon(P.neonCyan, 1.8));
  rim.position.y = 0.34;
  g.add(rim);
  const rand = rng(seed * 101);
  const leafGeo = new THREE.SphereGeometry(1, 10, 6);
  leafGeo.scale(0.075, 0.012, 0.3);
  leafGeo.translate(0, 0, 0.28);
  const leaves = [];
  for (let i = 0; i < 13; i++) {
    const leaf = leafGeo.clone();
    const yaw = (i / 13) * TAU + rand() * 0.4;
    const pitch = -0.35 - rand() * 0.75;
    leaf.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')));
    leaf.translate(0, 0.36 + rand() * 0.12, 0);
    leaves.push(leaf);
  }
  leafGeo.dispose();
  g.add(merged(leaves, solid(0x2f9a63, { roughness: 0.6, metalness: 0.05, env: 0.5, emissive: 0x0b3d24, emissiveIntensity: 0.6 })));
  return g;
}
