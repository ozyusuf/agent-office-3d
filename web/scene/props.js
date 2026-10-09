// Stations and decor built from primitives (docs/DESIGN.md section 4). Each builder returns
// { group, anchor, core?, hover?, tick?, bounds? }: `anchor` is the world point its HTML label hangs
// from; `core` is where a failed call sputters; `hover` is where a helper bot waits while working
// there; `tick(t, dt)` runs the motion; `bounds` are points the camera keeps in view vertically.
// Stations react to `drive` (set by realm.js from real events): `drive.act[key]` is 0..1 while the
// station works. Anything that changes at runtime has a material of its own (`neon(..., { own })`).

import * as THREE from 'three';
import { P, TAU, FACE_CAMERA, rng, neon, solid, MAT, TEX, pipeGeometries, merged, glowSprite, flatRing, setGlow, live, liveCss, lamp, brighten } from './kit.js';
import { PLATFORMS } from './world.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** World position of a point given in a group's local space. */
function localPoint(group, x, y, z) {
  group.updateMatrixWorld(true);
  return group.localToWorld(v3(x, y, z));
}

export function buildProps(scene, camera, drive) {
  const ticks = [];
  const anchors = {};
  const cores = {};
  const hovers = {};
  const bounds = [];
  const add = (key, built) => {
    scene.add(built.group);
    if (built.anchor) anchors[key] = built.anchor;
    if (built.core) cores[key] = built.core;
    if (built.hover) hovers[key] = built.hover;
    if (built.tick) ticks.push(built.tick);
    if (built.bounds) bounds.push(...built.bounds);
  };
  const billboard = camera.quaternion.clone();

  add('desk', commandDesk(drive));
  add('editor', codeEditor(billboard, drive));
  add('board', visionBoard(drive));
  add('centrifuge', centrifuge(drive));
  add('orbit', orbitSphere(drive));
  add('racks', serverRacks(drive));
  add('falls', dataFalls(drive));
  add('portal', portals(drive));
  add('arcade', arcade(drive));
  add('decor', decor());
  ticks.push(sputters(scene, cores, drive));
  return { anchors, cores, hovers, ticks, bounds };
}

// PostToolUseFailure: the failed call's station sputters (a short, flickering red glow).
function sputters(scene, cores, drive) {
  const rand = rng(61);
  const sprites = Object.entries(cores).map(([key, at]) => {
    const sprite = glowSprite(P.alertRed, 2.8, 0);
    sprite.position.copy(at);
    sprite.visible = false;
    scene.add(sprite);
    return { key, sprite };
  });
  return () => {
    for (const { key, sprite } of sprites) {
      const s = drive.sputter[key] ?? 0;
      sprite.visible = s > 0.01;
      if (sprite.visible) sprite.material.opacity = s * (rand() < 0.4 ? 0.12 : 1);
    }
  };
}

// ---- Command desk: round dais, floating curved console, holo keyboard, laptop ----

export const DESK_POS = v3(0, 0, 0);
export const DAIS_TOP = 0.2;

function commandDesk(drive) {
  const group = new THREE.Group();
  group.position.copy(DESK_POS);
  group.rotation.y = FACE_CAMERA;

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.64, DAIS_TOP, 56), MAT.hull);
  dais.position.y = DAIS_TOP / 2;
  group.add(dais);
  const deskLamps = [];
  for (const [r, tube, glow, y] of [[2.48, 0.035, 2.2, DAIS_TOP + 0.005], [1.62, 0.02, 1.2, DAIS_TOP + 0.005], [3.15, 0.026, 1.1, 0.01]]) {
    const material = lamp(P.neonCyan, glow);
    deskLamps.push(material);
    const ring = flatRing(r, tube, material);
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
  const consoleLamps = [lamp(P.neonCyan, 2.6), lamp(P.neonCyan, 1.6), lamp(P.neonCyan, 1.3)];
  group.add(arcTube(r1 + 0.006, y + 0.006, a0, a1, 0.026, consoleLamps[0]));
  group.add(arcTube(r1 - 0.15, y - 0.46, a0 + 0.05, a1 - 0.05, 0.018, consoleLamps[1]));
  group.add(arcTube(r0 + 0.01, y + 0.006, a0, a1, 0.014, consoleLamps[2]));

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
  const holos = [];
  for (const [a, w] of [[-0.9, 0.5], [0.9, 0.46]]) {
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), new THREE.MeshBasicMaterial({
      map: TEX.board, color: new THREE.Color(0xffffff).multiplyScalar(1.4), transparent: true, opacity: 0.85,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    holo.position.set(1.45 * Math.sin(a), y + 0.4, 1.45 * Math.cos(a));
    holo.rotation.set(-0.35, a, 0, 'YXZ');
    group.add(holo);
    holos.push(holo.material);
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
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), neon(P.neonCyanSoft, 0.9));
  face.position.set(0, 0.12, 0.11);
  face.rotation.x = 0.25 + Math.PI;
  laptop.add(face);
  group.add(laptop);

  let spin = 0;
  return {
    group,
    anchor: localPoint(group, 0, 2.0, 1.6),
    core: v3(0, 1.3, 0),
    hover: v3(1.9, 3.7, -1.4),
    tick(t, dt) {
      // Other tools (MCP, skills, ...) make the holograms pulse; a new prompt flashes the dais.
      const busy = drive.act.desk;
      const work = Math.max(busy, drive.typing);
      spin += dt * (0.15 + busy * 0.9 + drive.prompt * 2.5);
      dashes.rotation.z = spin;
      dashes.material.opacity = 0.6 * (0.25 + 0.75 * Math.max(work, drive.prompt));
      brighten(deskLamps, Math.max(work * 0.8, drive.prompt * 1.3));
      brighten(consoleLamps, work + drive.prompt * 0.5, 0.42); // the agent's home: never quite dark
      setGlow(keys.material, P.neonCyan, 0.5 + drive.typing * (1.4 + 0.6 * Math.abs(Math.sin(t * 23))) + drive.prompt * 1.5);
      for (const m of holos) m.color.setScalar(0.8 * (1 + busy * (0.8 + 0.4 * Math.sin(t * 9))));
    },
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

// ---- Code Editor: a workbench with a monitor (an editor that writes line by line), a floating
// </> sign and a rubber duck ----

/** Where the bench stands; turned a little towards the desk, so the character works at it half side-on (walk.js). */
const EDITOR_POS = v3(-2.55, 0, 2.95);
const EDITOR_YAW = FACE_CAMERA + 0.35;

function codeEditor(billboard, drive) {
  const group = new THREE.Group();
  group.position.copy(EDITOR_POS);
  group.rotation.y = EDITOR_YAW;

  // Workbench: a top on two side panels, a lamp strip along the front edge.
  const W = 2.1;
  const D = 0.8;
  const TOP = 1.0;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.09, D), MAT.hull);
  top.position.y = TOP - 0.045;
  group.add(top);
  const frame = [];
  for (const s of [-1, 1]) {
    const side = new THREE.BoxGeometry(0.1, TOP - 0.09, D - 0.12);
    side.translate(s * (W / 2 - 0.14), (TOP - 0.09) / 2, 0);
    frame.push(side);
    const foot = new THREE.BoxGeometry(0.22, 0.06, D);
    foot.translate(s * (W / 2 - 0.14), 0.03, 0);
    frame.push(foot);
  }
  const front = new THREE.BoxGeometry(W - 0.38, TOP - 0.42, 0.05);
  front.translate(0, TOP - 0.09 - (TOP - 0.42) / 2, D / 2 - 0.08);
  frame.push(front);
  group.add(merged(frame, MAT.hullDark));
  // The </> emblem on the front panel, left of where the character stands (always in view).
  const badgeLamp = lamp(P.fireOrange, 2.4);
  const badge = codeSign(badgeLamp);
  badge.scale.set(0.62, 0.62, 0.4);
  badge.position.set(-0.42, TOP - 0.36, D / 2 - 0.03);
  group.add(badge);
  const edge = lamp(P.fireOrange, 2.4);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.026, 0.02), edge);
  strip.position.set(0, TOP - 0.05, D / 2 + 0.006);
  group.add(strip);

  // Monitor on a stand at the back of the bench, left of the keyboard (so the character, who
  // types at the right end, does not hide it).
  const MX = -0.2;
  const MW = 2.0;
  const MH = 1.16;
  const MY = TOP + 0.5 + MH / 2;
  const MZ = -0.2;
  const stand = [];
  const post = new THREE.CylinderGeometry(0.05, 0.06, 0.56, 10);
  post.translate(MX, TOP + 0.28, MZ - 0.06);
  stand.push(post);
  const plate = new THREE.BoxGeometry(0.56, 0.035, 0.3);
  plate.translate(MX, TOP + 0.018, MZ - 0.02);
  stand.push(plate);
  group.add(merged(stand, MAT.trim));
  const monitor = new THREE.Group();
  monitor.position.set(MX, MY, MZ);
  monitor.rotation.x = -0.08;
  group.add(monitor);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(MW + 0.1, MH + 0.1, 0.08), MAT.hullDark);
  housing.position.z = -0.045;
  monitor.add(housing);
  const screen = editorScreen();
  const display = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: screen.texture }));
  monitor.add(display);
  const chin = lamp(P.fireOrange, 2.2);
  const led = new THREE.Mesh(new THREE.BoxGeometry(MW * 0.5, 0.022, 0.02), chin);
  led.position.set(0, -MH / 2 - 0.035, 0.002);
  monitor.add(led);

  // Keyboard at the right end, turned a little towards the character.
  const keyboard = new THREE.Group();
  keyboard.position.set(0.5, TOP, 0.12);
  keyboard.rotation.y = 0.14;
  group.add(keyboard);
  const keyCase = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.045, 0.26), MAT.trim);
  keyCase.position.y = 0.022;
  keyboard.add(keyCase);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.2), new THREE.MeshBasicMaterial({
    map: keysTexture(), color: new THREE.Color(P.fireOrange).multiplyScalar(0.3), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.y = 0.047;
  keyboard.add(keys);

  // The rubber duck at the other end, looking at the character (rubber duck debugging).
  const duck = rubberDuck();
  duck.position.set(-0.78, TOP, 0.12);
  duck.rotation.y = 1.0;
  group.add(duck);

  // The </> sign floating over the monitor.
  const signY = MY + MH / 2 + 0.62;
  const sign = new THREE.Group();
  sign.position.set(MX, signY, MZ);
  group.add(sign);
  const signLamp = lamp(P.fireOrange, 2.8);
  sign.add(codeSign(signLamp));
  const signHalo = glowSprite(P.fireOrange, 2.4, 0.05);
  sign.add(signHalo);

  // Code bits ({ }, ( ), ;) float up off the screen while the agent writes.
  const bits = ['{ }', '( )', ';'].map((text) => particles(4, glyphTexture(text), billboard));
  for (const b of bits) group.add(b.mesh);
  const rand = rng(5);
  const flying = bits.flatMap((b, kind) => b.items.map((_, i) => ({ kind, i, age: 1, life: 1, p: v3(0, 0, 0), v: v3(0, 0, 0), s: 1 })));
  const tint = new THREE.Color();
  let spawn = 0;

  return {
    group,
    anchor: localPoint(group, MX, signY + 0.6, MZ),
    core: localPoint(group, MX, MY, MZ + 0.2),
    hover: localPoint(group, MX + 0.4, signY + 1.6, MZ - 0.3), // above the station label
    tick(t, dt) {
      // Edit / Write / NotebookEdit: the editor writes, the sign and the lamps light up.
      const a = drive.act.editor;
      brighten([edge, chin], a, 0.25);
      brighten([signLamp, badgeLamp], a, 0.32);
      signHalo.material.opacity = 0.04 + 0.3 * a;
      sign.position.y = signY + Math.sin(t * 1.3) * 0.06;
      sign.rotation.y = Math.sin(t * 0.55) * (0.22 + 0.2 * a);
      display.material.color.setScalar(0.55 + 0.7 * a);
      setGlow(keys.material, P.fireOrange, 0.3 + a * (0.6 + 0.4 * Math.abs(Math.sin(t * 21))));
      screen.step(t, dt, a);

      spawn += dt * a * 5; // about five bits a second while busy
      for (const f of flying) {
        const b = bits[f.kind];
        if (f.age >= 1 && spawn >= 1) {
          spawn -= 1;
          f.age = 0;
          f.life = 1.3 + rand() * 0.8;
          f.s = 0.2 + rand() * 0.12;
          f.p.set(MX + (rand() - 0.5) * (MW - 0.4), MY + (rand() - 0.3) * MH * 0.6, MZ + 0.05);
          f.v.set((rand() - 0.5) * 0.3, 0.55 + rand() * 0.4, 0.35 + rand() * 0.25);
        }
        if (f.age < 1) {
          f.age += dt / f.life;
          f.p.addScaledVector(f.v, dt);
        }
        const fade = f.age < 1 ? Math.sin(Math.PI * Math.min(1, f.age * 1.6)) * (1 - f.age) : 0;
        tint.setHex(f.kind === 2 ? P.text : P.fireOrange).multiplyScalar(1.6 * fade);
        b.set(f.i, f.p, f.s * fade, f.s * fade, tint);
      }
      spawn = Math.min(spawn, 1);
      for (const b of bits) b.commit();
    },
  };
}

/** The </> sign: five rounded strokes. */
function codeSign(material) {
  const strokes = [
    [[-0.34, 0.28], [-0.62, 0]], [[-0.62, 0], [-0.34, -0.28]],
    [[0.12, 0.34], [-0.12, -0.34]],
    [[0.34, 0.28], [0.62, 0]], [[0.62, 0], [0.34, -0.28]],
  ];
  return merged(strokes.map(([[ax, ay], [bx, by]]) => {
    const geo = new THREE.CapsuleGeometry(0.055, Math.hypot(bx - ax, by - ay), 4, 8);
    geo.rotateZ(Math.atan2(by - ay, bx - ax) - Math.PI / 2);
    geo.translate((ax + bx) / 2, (ay + by) / 2, 0);
    return geo;
  }), material);
}

/** A rubber duck (its beak points along +z). */
function rubberDuck() {
  const duck = new THREE.Group();
  duck.scale.setScalar(1.5);
  // One mesh per material: body + tail + head, the beak, the eyes.
  const body = new THREE.SphereGeometry(0.15, 16, 12);
  body.scale(1, 0.75, 1.25);
  body.translate(0, 0.11, 0);
  const tail = new THREE.ConeGeometry(0.06, 0.12, 10);
  tail.rotateX(-2.2);
  tail.translate(0, 0.18, -0.17);
  const head = new THREE.SphereGeometry(0.095, 16, 12);
  head.translate(0, 0.27, 0.08);
  duck.add(merged([body, tail, head], solid(0xe8bc3c, { roughness: 0.45, metalness: 0, env: 0.3, emissive: 0x3a2a08, emissiveIntensity: 0.5 })));
  const beak = new THREE.SphereGeometry(0.05, 12, 8);
  beak.scale(1, 0.45, 1.1);
  beak.translate(0, 0.255, 0.18);
  duck.add(new THREE.Mesh(beak, solid(0xf08a3a, { roughness: 0.5, metalness: 0, emissive: 0x6a2a08 })));
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.016, 8, 6).translate(s * 0.05, 0.3, 0.155));
  duck.add(merged(eyes, solid(0x10121a, { roughness: 0.3, metalness: 0.2 })));
  return duck;
}

/** White glyph on a transparent square (code bits). */
function glyphTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = '700 40px Consolas, "Cascadia Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The monitor's picture: an editor window (title bar, tabs, gutter, minimap) whose code is
 * coloured bars, no text. While the agent edits, lines are written one by one at a cursor, new
 * lines push the rest down and get a change mark in the gutter. Redrawn only when it changes.
 */
function editorScreen() {
  const W = 400;
  const H = 232;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const LINE = 17;
  const FIRST = 38; // y of the first line's centre
  const ROWS = 11;
  const CODE_X = 56;
  const CODE_END = 352;
  const rand = rng(41);
  // Token colours (syntax): keyword, function (accent), string, plain, number, comment.
  const SYNTAX = ['#c792ea', null, '#a5d6a7', '#d9d4c7', '#f0b27a', '#5f6878'];
  const colour = (i) => SYNTAX[i] ?? liveCss(P.neonCyanSoft);

  let indent = 0;
  function makeLine() {
    indent = Math.max(0, Math.min(3, indent + [-1, 0, 0, 1][Math.floor(rand() * 4)]));
    if (rand() < 0.12) return { indent, tokens: [], mark: false };
    if (rand() < 0.1) return { indent, tokens: [{ len: 60 + rand() * 120, c: 5 }], mark: false };
    const tokens = [];
    const n = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) tokens.push({ len: 12 + rand() * 46, c: i === 0 && rand() < 0.6 ? 0 : 1 + Math.floor(rand() * 4) });
    return { indent, tokens, mark: false };
  }
  const width = (line) => line.tokens.reduce((sum, tok) => sum + tok.len + 7, 0);
  const lines = Array.from({ length: ROWS }, makeLine);
  let cur = 5; // row of the line being written
  let typed = 0; // px written on it
  let target = null; // the line being written
  let dirty = true;
  let lastDraw = -1;
  let blinkOn = true;
  let tint = null;

  function newLine() {
    // A new line under the cursor pushes the rest down; near the bottom the view scrolls.
    target = makeLine();
    target.mark = true;
    target.full = target.tokens;
    target.tokens = [];
    cur = Math.min(cur + 1, ROWS - 1);
    lines.splice(cur, 0, target);
    lines.length = ROWS;
    if (cur >= ROWS - 3) {
      lines.shift();
      lines.push(makeLine());
      cur--;
    }
    typed = 0;
  }

  function draw(cursorOn) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d0f19';
    g.fillRect(0, 0, W, H);
    // title bar, window buttons, tabs
    g.fillStyle = '#1a1d2b';
    g.fillRect(0, 0, W, 22);
    for (const [x, c] of [[12, '#ff5f57'], [27, '#febc2e'], [42, '#28c840']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, 11, 4.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#0d0f19';
    g.fillRect(60, 4, 96, 18);
    g.fillStyle = '#f1ad56';
    g.fillRect(60, 4, 96, 2);
    g.fillStyle = 'rgba(217,212,199,0.8)';
    g.fillRect(72, 11, 58, 5);
    g.fillStyle = 'rgba(217,212,199,0.3)';
    g.fillRect(170, 11, 46, 5);
    g.fillRect(232, 11, 38, 5);
    // activity bar and gutter
    g.fillStyle = '#141725';
    g.fillRect(0, 22, 18, H - 34);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i === 0 ? 'rgba(217,212,199,0.75)' : 'rgba(217,212,199,0.25)';
      g.fillRect(5, 32 + i * 20, 8, 8);
    }
    // current line
    const yCur = FIRST + cur * LINE;
    g.fillStyle = 'rgba(241,173,86,0.13)';
    g.fillRect(20, yCur - LINE / 2, CODE_END - 20, LINE);
    lines.forEach((line, row) => {
      const y = FIRST + row * LINE;
      // line number (a dim tick, no digits), change mark
      g.fillStyle = row === cur ? 'rgba(217,212,199,0.8)' : 'rgba(120,128,150,0.5)';
      g.fillRect(34 - (row % 3 === 0 ? 10 : 6), y - 2, row % 3 === 0 ? 10 : 6, 4);
      if (line.mark) {
        g.fillStyle = '#f1ad56';
        g.fillRect(42, y - LINE / 2 + 1, 4, LINE - 2);
      }
      let x = CODE_X + line.indent * 16;
      for (const tok of line.tokens) {
        const len = Math.min(tok.len, CODE_END - x);
        if (len <= 0) break;
        g.fillStyle = colour(tok.c);
        g.fillRect(x, y - 3, len, 6);
        x += tok.len + 7;
      }
      if (row === cur && cursorOn) {
        g.fillStyle = '#ffcf8a';
        g.fillRect(Math.min(x, CODE_END), y - 7, 3, 14);
      }
    });
    // minimap with the visible part
    g.fillStyle = '#11131f';
    g.fillRect(360, 22, W - 360, H - 34);
    for (let i = 0; i < 40; i++) {
      const m = lines[i % ROWS];
      g.fillStyle = 'rgba(160,168,190,0.35)';
      g.fillRect(366 + m.indent * 3, 26 + i * 4.6, Math.min(28, 6 + width(m) / 10), 2);
    }
    g.fillStyle = 'rgba(217,212,199,0.1)';
    g.fillRect(360, 60, W - 360, 52);
    // status bar
    g.fillStyle = '#1a1d2b';
    g.fillRect(0, H - 12, W, 12);
    g.fillStyle = '#f1ad56';
    g.fillRect(0, H - 12, 34, 12);
    texture.needsUpdate = true;
  }

  return {
    texture,
    /** `a` = how busy the editor is (0..1). Writes while busy; still when idle. */
    step(t, dt, a) {
      if (a > 0.05) {
        if (!target) newLine();
        typed += dt * 150 * a;
        let left = typed;
        target.tokens = [];
        for (const tok of target.full) {
          if (left <= 0) break;
          target.tokens.push({ len: Math.min(tok.len, left), c: tok.c });
          left -= tok.len + 7;
        }
        if (left > 12) newLine(); // line done: start the next one
        dirty = true;
      }
      const blink = a > 0.05 ? Math.floor(t * 2.5) % 2 === 0 : true;
      if (blink !== blinkOn) {
        blinkOn = blink;
        dirty = true;
      }
      if (live(P.neonCyanSoft) !== tint) {
        tint = live(P.neonCyanSoft);
        dirty = true;
      }
      if (dirty && t - lastDraw > 1 / 15) {
        draw(blinkOn);
        dirty = false;
        lastDraw = t;
      }
    },
  };
}

/** Camera-facing quads in one InstancedMesh (code bits). */
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

function visionBoard(drive) {
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
  const screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: TEX.board, color: new THREE.Color(0xffffff).multiplyScalar(1.3), transparent: true, opacity: 0.93,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  group.add(screen);

  // Ticker strip across the bottom of the screen (the character label covers the top): the file
  // being read, the search pattern, or one chip per task (values of the latest call, drawn only
  // when they change).
  const ticker = tickerTexture();
  const stripGeo = new THREE.CylinderGeometry(R - 0.07, R - 0.07, 0.55, 40, 1, true, Math.PI - half * 0.96, 2 * half * 0.96);
  const stripUv = stripGeo.attributes.uv;
  for (let i = 0; i < stripUv.count; i++) stripUv.setX(i, 1 - stripUv.getX(i));
  stripGeo.translate(0, yMid - H / 2 + 0.4, R);
  const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({
    map: ticker.texture, color: new THREE.Color(0xffffff).multiplyScalar(2.0), transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  strip.visible = false;
  group.add(strip);

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
  const frameMat = neon(P.neonCyan, 2.6, { own: true });
  group.add(merged(frame, frameMat));

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
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.035, 0.05), neon(P.neonCyan, 2.4, { own: true }));
  beam.position.set(0, 0.17, 0.41);
  group.add(beam);
  const glow = glowSprite(P.neonBlue, 6, 0.3);
  glow.position.set(0, yMid, 0.1);
  group.add(glow);

  let shown = null;
  let tint = null; // the accent the ticker was drawn in
  return {
    group,
    anchor: localPoint(group, 1.1, yMid + H / 2 + 0.2, 0.2),
    core: localPoint(group, 0, yMid, 0.3),
    hover: localPoint(group, -1.7, yMid + H / 2 + 0.35, 0.7), // over the top left corner, clear of the label
    tick(t, dt) {
      // Read / Grep / Glob / task tools: the screen brightens and the ticker shows what is used.
      const a = drive.act.board;
      screen.material.color.setScalar(0.48 + 0.95 * a);
      setGlow(frameMat, P.neonCyan, 2.6 * (0.3 + 0.75 * a));
      setGlow(beam.material, P.neonCyan, 2.4 * (0.3 + 0.8 * a));
      glow.material.opacity = 0.06 + 0.32 * a;
      if (drive.board !== shown || live(P.neonCyanSoft) !== tint) {
        shown = drive.board;
        tint = live(P.neonCyanSoft);
        ticker.draw(shown);
      }
      strip.visible = a > 0.01 && Boolean(shown);
      strip.material.opacity = a;
      if (strip.visible && !shown.todos) ticker.texture.offset.x = (ticker.texture.offset.x + dt * 0.08) % 1;
      else ticker.texture.offset.x = 0;
    },
  };
}

/** Canvas texture for the board's ticker strip. */
function tickerTexture() {
  const W = 1024;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;

  // Small icon at x: a page for Read, a magnifier for Grep / Glob.
  const icon = (kind, x) => {
    g.strokeStyle = '#e6f6ff';
    g.lineWidth = 3;
    if (kind === 'search') {
      g.beginPath();
      g.arc(x + 10, 28, 11, 0, TAU);
      g.moveTo(x + 18, 36);
      g.lineTo(x + 28, 46);
      g.stroke();
    } else {
      g.strokeRect(x, 14, 22, 30);
      for (const y of [22, 29, 36]) {
        g.beginPath();
        g.moveTo(x + 5, y);
        g.lineTo(x + 17, y);
        g.stroke();
      }
    }
  };

  const fit = (text, max) => {
    if (g.measureText(text).width <= max) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (g.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid;
      else hi = mid - 1;
    }
    return `${text.slice(0, lo)}…`;
  };

  // One chip per task: done green, in progress yellow, open as an outline.
  const chips = ({ total, done, doing }) => {
    const shown = Math.min(total, 22);
    for (let i = 0; i < shown; i++) {
      const x = 24 + i * 40;
      if (i < done) {
        g.fillStyle = '#56d999';
        g.fillRect(x, 17, 28, 28);
      } else if (i < done + doing) {
        g.fillStyle = '#f4c752';
        g.fillRect(x, 17, 28, 28);
      } else {
        g.strokeStyle = liveCss(P.neonCyanSoft);
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, 18.5, 25, 25);
      }
    }
    if (total > shown) {
      g.fillStyle = '#e6f6ff';
      g.fillText(`+${total - shown}`, 24 + shown * 40, H / 2 + 1);
    }
  };

  return {
    texture,
    draw(content) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(2, 8, 22, 0.94)';
      g.fillRect(0, 6, W, H - 12);
      g.fillStyle = liveCss(P.neonCyanSoft, 0.9);
      g.fillRect(0, 6, W, 2);
      g.fillRect(0, H - 8, W, 2);
      if (content) {
        g.font = '600 34px Consolas, "Cascadia Mono", monospace';
        g.textBaseline = 'middle';
        g.shadowColor = liveCss(P.neonCyanSoft, 0.9);
        g.shadowBlur = 8;
        if (content.todos) {
          chips(content.todos);
        } else if (content.target) {
          // The text repeats along the strip (squeezed a little so the repeats tile seamlessly),
          // so part of it is always visible next to the character.
          const text = fit(content.target, W - 120);
          const segment = 44 + g.measureText(text).width + 70;
          const n = Math.max(1, Math.round(W / segment));
          g.setTransform(W / (n * segment), 0, 0, 1, 0, 0);
          g.fillStyle = '#ffffff';
          for (let i = 0; i < n; i++) {
            icon(content.kind, 12 + i * segment);
            g.fillText(text, 12 + i * segment + 44, H / 2 + 1);
          }
          g.setTransform(1, 0, 0, 1, 0, 0);
        }
        g.shadowBlur = 0;
      }
      texture.needsUpdate = true;
    },
  };
}

// ---- Terminal (key "centrifuge"): three nested gimbal rings on a base, spins for shell commands ----

function centrifuge(drive) {
  const p = PLATFORMS.east;
  const group = new THREE.Group();
  group.position.set(p.x, p.top, p.z);
  group.rotation.y = FACE_CAMERA;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.56, 0.4, 44), MAT.hull);
  base.position.y = 0.2;
  group.add(base);
  const baseLamp = lamp(P.warnYellow, 2.2);
  const baseRim = flatRing(1.41, 0.035, baseLamp);
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

  const rings = [[P.fireOrange, 2.6], [P.neonCyan, 2.5], [P.warnYellow, 2.4]].map(([color, intensity]) => (
    { color, intensity, material: neon(color, intensity, { own: true }) }));
  const outer = new THREE.Group();
  outer.position.y = cy;
  group.add(outer);
  outer.add(new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.075, 10, 96), rings[0].material));
  const middle = new THREE.Group();
  outer.add(middle);
  middle.add(new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.065, 10, 80), rings[1].material));
  const inner = new THREE.Group();
  middle.add(inner);
  inner.add(new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 10, 72), rings[2].material));
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), neon(P.neonCyanSoft, 1.5, { own: true }));
  outer.add(heart);
  const halo = glowSprite(P.neonCyan, 1.8, 0.4);
  outer.add(halo);

  const spin = [0, 0, 0];
  return {
    group,
    anchor: localPoint(group, 0.8, cy + 2.3, 0), // above the rings, a little to the right
    core: localPoint(group, 0, cy, 0),
    hover: localPoint(group, -0.9, cy + 2.0, 0.9),
    tick(t, dt) {
      // Bash / PowerShell: the inner rings spin up and glow brighter.
      const a = drive.act.centrifuge;
      const speed = 1 + 4.5 * a;
      spin[0] += dt * 0.6 * speed;
      spin[1] += dt * 0.9 * speed;
      spin[2] += dt * 0.4 * speed;
      // The outer ring stays roughly upright towards the camera; the inner two spin.
      outer.rotation.x = Math.sin(t * 0.5) * 0.3;
      outer.rotation.y = Math.sin(t * 0.37) * 0.35;
      middle.rotation.y = spin[0];
      inner.rotation.x = spin[1];
      inner.rotation.z = spin[2];
      disc.rotation.z = -spin[0] * 0.6;
      for (const r of rings) setGlow(r.material, r.color, r.intensity * (0.09 + 1.26 * a));
      brighten([baseLamp], a, 0.2);
      disc.material.opacity = 0.25 + 0.75 * a;
      setGlow(heart.material, P.neonCyanSoft, 1.5 * (0.3 + 1.4 * a));
      halo.material.opacity = 0.06 + 0.55 * a;
    },
  };
}

// ---- Orbit Sphere: glowing planet with two tilted rings, on a pipe pedestal ----

function orbitSphere(drive) {
  const group = new THREE.Group();
  group.position.set(-2.4, PLATFORMS.north.top, -7.8);

  const ped = pipeGeometries([[0, 0, 0], [0, 2.6, 0]], 0.18, { flanges: true });
  const cup = new THREE.CylinderGeometry(0.55, 0.26, 0.32, 24);
  cup.translate(0, 2.74, 0);
  ped.push(cup);
  group.add(merged(ped, MAT.pipe));
  const cupRim = flatRing(0.55, 0.028, neon(P.neonCyan, 1.0));
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
    const material = neon(color, 2.4, { own: true });
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96), material));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), neon(color, 1.6));
    ring.add(moon);
    group.add(ring);
    rings.push({ moon, r, color, material, angle: rings.length * 2 });
  }

  let turn = 0;
  return {
    group,
    anchor: localPoint(group, 0, sphereY + 1.6, 0),
    core: localPoint(group, 0, sphereY, 0),
    hover: localPoint(group, 1.5, sphereY + 1.1, 1.3),
    tick(t, dt) {
      // WebSearch / WebFetch: the planet spins faster and its rings brighten.
      const a = drive.act.orbit;
      turn += dt * 0.25 * (1 + 5 * a);
      planet.rotation.y = turn;
      rings.forEach((ring, i) => {
        ring.angle += dt * (0.5 + i * 0.3) * (1 + 3 * a);
        ring.moon.position.set(Math.cos(ring.angle) * ring.r, Math.sin(ring.angle) * ring.r, 0);
        setGlow(ring.material, ring.color, 2.4 * (0.25 + 1.1 * a));
      });
      planet.material.color.setScalar(0.7 + 0.9 * a);
      atmo.material.opacity = 0.2 + 0.6 * a;
    },
  };
}

// ---- Server racks: three tall cabinets with LED rows (unlit until stage 4 drives them) ----

/** Number of LEDs on the three racks (realm.js lights a share of them by context fill). */
export const RACK_LEDS = 3 * 16 * 3;

function serverRacks(drive) {
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
    const power = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), neon(P.okGreen, 1.6));
    power.position.set(x + D / 2 + 0.01, p.top + H - 0.18, z - 0.42);
    group.add(power);
  }
  group.add(leds);
  const stripMat = neon(P.neonCyan, 2.0, { own: true });
  group.add(merged(strips, stripMat));

  // Fill order: the bottom row of all three racks first, then upwards (so they drain top to bottom).
  const order = [];
  for (let row = 0; row < rows; row++) {
    for (let cab = 0; cab < zs.length; cab++) {
      for (let col = 0; col < cols; col++) order.push(cab * rows * cols + row * cols + col);
    }
  }
  const lit = new THREE.Color(P.okGreen).multiplyScalar(2.4);
  const c = new THREE.Color();
  return {
    group,
    anchor: v3(x, p.top + H + 0.6, zs[1]),
    core: v3(x + 0.6, p.top + H / 2, zs[1]),
    hover: v3(x + 2.0, p.top + H + 0.9, zs[1] + 1.2),
    tick(t) {
      // LEDs lit = context fill (drive.rack.lit LEDs, eased); compaction flashes the strips.
      const on = drive.rack.lit;
      for (let r = 0; r < order.length; r++) {
        const f = Math.max(0, Math.min(1, on - r));
        if (f > 0) c.copy(lit).multiplyScalar(0.85 + 0.15 * Math.sin(t * (2 + (r % 5)) + r * 1.7));
        leds.setColorAt(order[r], f > 0 ? c.lerpColors(off, c, f) : off);
      }
      leds.instanceColor.needsUpdate = true;
      setGlow(stripMat, P.neonCyan, 2.0 * (0.32 + drive.rack.flash * (1.2 + 0.9 * Math.sin(t * 14))));
    },
  };
}

// ---- Data falls: two cyan waterfalls pouring into glowing basins ----

function dataFalls(drive) {
  const group = new THREE.Group();
  const ticks = [];
  const glows = []; // { material, opacity } faded with the activity rate
  const rims = [];
  let flow = 0; // 0 = no events in the last minute, 1 = busy

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
      glows.push({ material: mesh.material, opacity });
      ticks.push((dt) => { tex.offset.y = (tex.offset.y + dt * speed * drive.falls) % 1; });
    }
    const splash = glowSprite(P.neonCyan, 1.8, 0.6);
    splash.position.set(x, yBottom + 0.1, z);
    group.add(splash);
    glows.push({ material: splash.material, opacity: 0.6 });
  };

  const basin = (x, y, z, r) => {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.34, 40), MAT.hull);
    tub.position.set(x, y + 0.17, z);
    group.add(tub);
    const rimLamp = lamp(P.neonCyan, 2.6);
    rims.push(rimLamp);
    const rim = flatRing(r, 0.038, rimLamp);
    rim.position.set(x, y + 0.35, z);
    group.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.06, 40), new THREE.MeshBasicMaterial({
      map: TEX.ripple, color: new THREE.Color(P.neonCyan).multiplyScalar(1.5), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y + 0.32, z);
    group.add(water);
    water.material.opacity = 1;
    glows.push({ material: water.material, opacity: 1 });
    ticks.push((dt) => { water.rotation.z -= dt * 0.4 * drive.falls; });
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
  pool.material.transparent = true;
  glows.push({ material: pool.material, opacity: 1 });
  const fount = glowSprite(P.neonCyan, 2.0, 0.45);
  glows.push({ material: fount.material, opacity: 0.45 });
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
    // Speed and brightness follow the activity rate (events in the last minute): dim and slow when idle.
    tick: (t, dt) => {
      flow = Math.min(1, Math.max(0, (drive.falls - 0.3) / 2));
      for (const f of ticks) f(dt);
      for (const g of glows) g.material.opacity = g.opacity * (0.3 + 0.7 * flow);
      brighten(rims, flow);
    },
  };
}

// ---- Portal rings: a big one floating above the racks, a small one on a pipe ----

function portals(drive) {
  const group = new THREE.Group();
  const spinners = [];
  const lamps = [];
  const ring = (x, y, z, r, outer, innerColor) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mats = [lamp(outer, 2.7), lamp(P.neonPurple, 2.2), lamp(innerColor, 2.5)];
    lamps.push(...mats);
    g.add(flatRing(r, r * 0.045, mats[0]));
    g.add(flatRing(r * 0.88, r * 0.016, mats[1]));
    g.add(flatRing(r * 0.7, r * 0.022, mats[2]));
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
    spinners.push({ g, dash, core, y });
  };
  const big = v3(-4.4, 5.1, -4.2);
  ring(big.x, big.y, big.z, 2.0, P.neonMagenta, P.neonCyan);
  ring(-8.6, 4.67, -0.1, 0.85, P.neonPurple, P.neonMagenta);

  let spin = 0;
  return {
    group,
    anchor: v3(big.x, big.y + 1.0, big.z),
    core: big.clone(),
    hover: big.clone(), // helper bots rise out of here (helpers.js)
    bounds: [big.clone().add(v3(-1.5, 0.3, -1.5))], // far rim of the big ring
    tick(t, dt) {
      // Subagents: the rings spin faster, the core flares when a helper comes or goes.
      const a = drive.act.portal;
      spin += dt * (1 + 3 * a);
      brighten(lamps, a + drive.portalFlash * 0.6, 0.08);
      spinners.forEach(({ g, dash, core, y }, i) => {
        dash.rotation.z = spin * (i ? -0.5 : 0.3);
        g.position.y = y + Math.sin(t * 0.8 + i * 2) * 0.08;
        dash.material.opacity = 0.8 * (0.12 + 0.88 * Math.min(1, a + drive.portalFlash));
        core.material.opacity = 0.04 + 0.5 * a + 0.5 * drive.portalFlash;
      });
    },
  };
}

// ---- Arcade cabinet (the character plays here when idle, stage 4) ----

function arcade(drive) {
  const p = PLATFORMS.west;
  const group = new THREE.Group();
  group.position.set(-7.25, p.top, 1.65);
  group.rotation.y = Math.PI / 2 - 0.15;
  group.scale.setScalar(1.3);

  const bodyMat = solid(0x2a1442, { roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.85, 0.72), bodyMat);
  body.position.y = 0.925;
  group.add(body);
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.16), neon(P.neonMagenta, 2.4, { own: true }));
  marquee.position.set(0, 1.82, 0.3);
  group.add(marquee);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.58, 0.04), solid(0x0b0614, { roughness: 0.7, metalness: 0.2 }));
  bezel.position.set(0, 1.32, 0.35);
  bezel.rotation.x = -0.12;
  group.add(bezel);
  const game = TEX.arcade.clone();
  game.wrapS = THREE.RepeatWrapping;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.48), new THREE.MeshBasicMaterial({
    map: game, color: new THREE.Color(0xffffff).multiplyScalar(1.7),
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
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), neon(c, 1.2));
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
  const edgeLamp = lamp(P.neonMagenta, 2.2);
  group.add(merged(edges, edgeLamp));
  const glow = glowSprite(P.neonMagenta, 1.8, 0.35);
  glow.position.set(0, 1.4, 0.6);
  group.add(glow);

  return {
    group,
    anchor: localPoint(group, 0, 2.4, 0),
    core: localPoint(group, 0, 1.3, 0.3),
    hover: localPoint(group, 0.3, 2.6, 1.0),
    tick(t) {
      // After a finished turn the agent plays: the screen lights up and the invaders march.
      const a = drive.act.arcade;
      screen.material.color.setScalar(0.3 + 1.5 * a);
      game.offset.x = a > 0.5 ? ((Math.floor(t * 2.5) % 4) - 1.5) / 32 : 0;
      setGlow(marquee.material, P.neonMagenta, 2.4 * (0.18 + a * (0.95 + 0.25 * Math.sin(t * 6))));
      brighten([edgeLamp], a, 0.15);
      glow.material.opacity = 0.05 + 0.32 * a;
    },
  };
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
  const band = flatRing(0.275, 0.022, neon(P.neonCyan, 0.9));
  band.position.y = 0.42;
  canister.add(band);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 20), neon(P.neonCyanSoft, 0.7));
  lid.position.y = 0.59;
  canister.add(lid);
  group.add(canister);

  const box = new THREE.Group();
  box.position.set(3.1, 0, -1.1); // clear of the walk to the board (walk.js)
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
  box.add(merged(lights, neon(P.fireOrange, 1.3)));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), neon(P.neonCyan, 0.55));
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
  const rim = flatRing(0.24, 0.012, neon(P.neonCyan, 0.7));
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
