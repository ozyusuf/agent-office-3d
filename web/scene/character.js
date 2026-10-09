// The agent: a chibi hacker built from primitives (big head, messy hair, cyan visor, headphones,
// dark hoodie with cyan trims). Local +z is the front; feet at y = 0.
// It walks the network in walk.js to the spot the director picks (director.js), then takes that
// spot's pose. Arms are named by their side in local space: `armR` is at +x, which is screen right
// while the character faces the camera.

import * as THREE from 'three';
import { P, rng, neon, solid, merged, flatRing, glowSprite, MAT, ease } from './kit.js';
import { SPOTS, YAW_CAMERA, planPath, pathLength, floorAt, spotPoint } from './walk.js';

const SCALE = 1.85;
const HIP_Y = 0.45; // local height of the hip joints
const STRIDE = 5.6; // walk cycle (radians) per world unit walked (at walking speed)
const WALK_S = 1.2; // a walk takes about this long: speed = length / WALK_S, within the limits below
const MIN_SPEED = 3.2; // world units per second
const MAX_SPEED = 7.5;
const FADE_S = 0.8; // appear / fade out time

export function buildCharacter() {
  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group(); // legs + upper body
  root.add(body);
  const upper = new THREE.Group(); // torso, arms, head: pivots at the hips (lean, bob)
  upper.position.y = HIP_Y;
  body.add(upper);
  const top = new THREE.Group(); // parts below use plain heights above the feet
  top.position.y = -HIP_Y;
  upper.add(top);

  // A little self-light keeps skin and hair readable in the dark, cyan-lit scene.
  const skin = solid(0xf2c0a0, { roughness: 0.65, metalness: 0, env: 0.25, emissive: 0xc87a5a, emissiveIntensity: 0.42 });
  const hoodie = solid(0x262a3e, { roughness: 0.8, metalness: 0.05, env: 0.5 });
  const pants = solid(0x15182a, { roughness: 0.8, metalness: 0.05, env: 0.4 });
  const hair = solid(0x2e1a10, { roughness: 0.8, metalness: 0, env: 0.1, emissive: 0x52281a, emissiveIntensity: 0.75 });
  const gear = solid(0x1d2029, { roughness: 0.35, metalness: 0.6, env: 0.9 });
  const trim = neon(P.neonCyan, 1.7);

  // Legs and shoes, on hip joints
  const hips = {};
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, HIP_Y, 0);
    body.add(hip);
    hips[s] = hip;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.24, 4, 10), pants);
    leg.position.y = 0.25 - HIP_Y;
    hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), solid(0x30364a, { roughness: 0.55, metalness: 0.2 }));
    shoe.scale.set(0.1, 0.07, 0.15);
    shoe.position.set(s * 0.01, 0.06 - HIP_Y, 0.04);
    hip.add(shoe);
    const sole = flatRing(0.092, 0.01, neon(P.neonCyan, 1.3));
    sole.scale.set(1, 1.5, 1);
    sole.position.set(s * 0.01, 0.022 - HIP_Y, 0.04);
    hip.add(sole);
  }

  // Torso (hoodie) with trims
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.24, 6, 16), hoodie);
  torso.scale.set(1.08, 1, 0.82);
  torso.position.y = 0.66;
  top.add(torso);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.236, 0.016, 6, 28), trim);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1.08, 0.82, 1);
  hem.position.y = 0.47;
  top.add(hem);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3, 0.01), trim);
  zip.position.set(0, 0.65, 0.196);
  top.add(zip);
  for (const s of [-1, 1]) {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 5), neon(P.text, 1.0));
    string.position.set(s * 0.06, 0.77, 0.2);
    top.add(string);
  }
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 20), hoodie);
  hood.rotation.x = Math.PI / 2 - 0.5;
  hood.position.set(0, 0.88, -0.1);
  top.add(hood);

  // Arms: shoulder and elbow joints. Shoulder x < 0 swings the arm forward; z > 0 raises the +x
  // arm sideways (z < 0 the -x arm). Elbow x < 0 bends the forearm forward.
  const arm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 0.82, 0);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.16, 4, 10), hoodie);
    upperArm.position.y = -0.12;
    shoulder.add(upperArm);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.14, 4, 10), hoodie);
    fore.position.y = -0.1;
    elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), trim);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.2;
    elbow.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 10), skin);
    hand.position.y = -0.26;
    elbow.add(hand);
    top.add(shoulder);
    return { shoulder, elbow };
  };
  const armR = arm(1);
  const armL = arm(-1);

  // Forge hammer in the +x hand: the handle sticks out of the fist, perpendicular to the forearm.
  const hammer = new THREE.Group();
  hammer.position.y = -0.27;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.46, 8), MAT.trim);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.17;
  hammer.add(handle);
  const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.16), MAT.trim);
  hammerHead.position.z = 0.42;
  hammer.add(hammerHead);
  for (const y of [-0.13, 0.13]) {
    const hot = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.04, 0.165), neon(P.fireOrange, 2.6));
    hot.position.set(0, y, 0.42);
    hammer.add(hot);
  }
  hammer.visible = false;
  armR.elbow.add(hammer);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.2;
  top.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), skin);
  neck.position.y = -0.3;
  head.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20), skin);
  skull.scale.set(1, 0.96, 0.95);
  head.add(skull);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 12, Math.PI * 0.8), solid(0x8a3b30, { roughness: 0.8, metalness: 0, emissive: 0x3a1410 }));
  smile.position.set(0, -0.16, 0.295);
  smile.rotation.set(-0.3, 0, Math.PI + Math.PI * 0.1);
  head.add(smile);

  // Hair: a cap pushed back (forehead stays visible), plus spiky tufts.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.362, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
  cap.rotation.x = -0.34;
  cap.position.set(0, 0.04, -0.03);
  head.add(cap);
  const tufts = [];
  const rand = rng(17);
  const tuft = (x, y, z, rx, rz, len, r) => {
    const g = new THREE.ConeGeometry(r, len, 7);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    g.translate(x, y, z);
    tufts.push(g);
  };
  for (let i = 0; i < 6; i++) {
    const a = -1.8 + (i / 5) * 3.6; // around the back and sides
    // Euler XYZ: the cone's up axis tilts to x by -sin(rz) and to z by sin(rx): point outwards.
    tuft(Math.sin(a) * 0.2, 0.2 + rand() * 0.05, -Math.cos(a) * 0.17 - 0.04, -Math.cos(a) * 0.9 + 0.05, -Math.sin(a) * 0.9, 0.14 + rand() * 0.06, 0.11);
  }
  tuft(0.02, 0.3, -0.05, -0.3, -0.15, 0.2, 0.095);
  tuft(-0.08, 0.3, 0.02, 0.1, 0.35, 0.16, 0.085);
  // fringe: short spikes sweeping forward and up over the forehead
  for (const [x, rz] of [[-0.14, 0.45], [-0.02, 0.1], [0.11, -0.35]]) tuft(x, 0.23, 0.12, 1.15, rz, 0.17, 0.07);
  head.add(merged(tufts, hair));

  // Visor
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.356, 0.356, 0.085, 28, 1, true, -1.05, 2.1), neon(P.neonCyan, 1.35, { side: THREE.DoubleSide }));
  visor.position.set(0, 0.01, 0.02);
  head.add(visor);
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.125, 28, 1, true, -1.15, 2.3), solid(0x10121a, { roughness: 0.35, metalness: 0.6 }));
  frame.material.side = THREE.DoubleSide;
  frame.position.set(0, 0.01, 0.015);
  head.add(frame);

  // Headphones
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.03, 8, 28, Math.PI), gear);
  band.position.set(0, 0.02, -0.03);
  band.rotation.x = -0.15;
  head.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 20), gear);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.37, 0.0, -0.02);
    head.add(cup);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.015, 6, 20), neon(P.neonCyan, 2.0));
    glow.rotation.y = Math.PI / 2;
    glow.position.set(s * 0.418, 0.0, -0.02);
    head.add(glow);
  }

  // Materials of its own (the shared ones are used all over the scene), so the figure can fade.
  const fading = ownMaterials(root);
  // A soft light column while it appears or fades out.
  const beam = glowSprite(P.neonCyan, 1, 0);
  beam.scale.set(0.9, 2.4, 1);
  beam.position.y = 0.9;
  beam.visible = false;
  root.add(beam);

  root.scale.setScalar(SCALE);
  const headTop = new THREE.Vector3(0, 1.72, 0);

  // ---- Movement and poses ----

  const start = spotPoint('desk');
  const pos = { x: start[0], z: start[1] };
  let footY = floorAt(pos.x, pos.z);
  let yaw = YAW_CAMERA;
  let goal = { spot: 'desk', pose: 'stand', visible: false };
  let heading = 'desk'; // spot the path leads to
  let path = [];
  let speed = MIN_SPEED; // of the current walk
  let opacity = 0;
  let phase = 0; // walk cycle
  let moving = false;

  const joints = makeJoints();
  const want = makeJoints();

  function place() {
    root.position.set(pos.x, footY, pos.z);
    root.rotation.y = yaw;
  }
  place();

  return {
    root,
    /** Writes the world point above the head (for the character label) into `out`. */
    headWorld(out) {
      return root.localToWorld(out.copy(headTop));
    },
    /** The pose it is in now ('walk' while moving). */
    pose: () => (moving ? 'walk' : goal.pose),
    setGoal(next) {
      goal = next;
      if (next.spot === heading) return;
      heading = next.spot;
      if (opacity < 0.05) {
        // Not visible: appear right at the spot instead of walking there.
        [pos.x, pos.z] = spotPoint(heading);
        footY = floorAt(pos.x, pos.z);
        path = [];
        return;
      }
      path = planPath([pos.x, pos.z], heading);
      speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, pathLength([pos.x, pos.z], path) / WALK_S));
    },
    tick(t, dt) {
      // Appear / fade out
      const target = goal.visible ? 1 : 0;
      if (opacity !== target) {
        opacity = target > opacity ? Math.min(1, opacity + dt / FADE_S) : Math.max(0, opacity - dt / FADE_S);
        fading(opacity);
        beam.visible = opacity > 0 && opacity < 1;
        beam.material.opacity = 0.75 * Math.sin(Math.PI * opacity);
      }
      root.visible = opacity > 0.004;

      // Walk along the path; long walks are run, so no walk takes much more than WALK_S.
      moving = path.length > 0;
      let face = goal.faceCamera ? YAW_CAMERA : SPOTS[heading].yaw;
      if (moving) {
        let step = speed * dt;
        phase += step * STRIDE * Math.min(1, 3.6 / speed); // longer strides when running
        while (step > 0 && path.length) {
          const [tx, tz] = path[0];
          const dx = tx - pos.x;
          const dz = tz - pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-6) face = Math.atan2(dx, dz);
          if (step >= d) {
            pos.x = tx;
            pos.z = tz;
            step -= d;
            path.shift();
          } else {
            pos.x += (dx / d) * step;
            pos.z += (dz / d) * step;
            step = 0;
          }
        }
      }
      yaw = turnTowards(yaw, face, dt * (moving ? 12 : 6));
      footY = ease(footY, floorAt(pos.x, pos.z), dt, 0.06);
      place();

      // Pose: blend all joints towards the wanted pose.
      (moving ? walkPose : POSES[goal.pose] ?? POSES.stand)(want, t, phase);
      blend(joints, want, 1 - Math.exp(-dt * 10));
      apply(joints, { armR, armL, head, hips, upper });
      hammer.visible = !moving && goal.pose === 'forge';
    },
  };
}

// ---- Poses ----

function makeJoints() {
  return { rS: [0, 0, 0], rE: [0, 0, 0], lS: [0, 0, 0], lE: [0, 0, 0], head: [0, 0, 0], hipR: 0, hipL: 0, lean: 0, bob: 0 };
}

const set = (v, x, y, z) => {
  v[0] = x;
  v[1] = y;
  v[2] = z;
};

function rest(w, t) {
  set(w.rS, 0.05, 0, 0.13);
  set(w.rE, -0.25, 0, 0);
  set(w.lS, 0.05, 0, -0.13);
  set(w.lE, -0.25, 0, 0);
  set(w.head, 0, 0, Math.sin(t * 0.9) * 0.04);
  w.hipR = 0;
  w.hipL = 0;
  w.lean = 0;
  w.bob = Math.sin(t * 2.2) * 0.012; // breathing
}

const POSES = {
  stand: rest,
  // At the desk: both hands on the holo keyboard.
  type(w, t) {
    rest(w, t);
    set(w.rS, -0.95, 0, 0.2);
    set(w.rE, -0.75 + Math.sin(t * 14) * 0.09, 0, -0.18);
    set(w.lS, -0.95, 0, -0.2);
    set(w.lE, -0.75 + Math.sin(t * 14 + 1.9) * 0.09, 0, 0.18);
    set(w.head, 0.2, 0, Math.sin(t * 0.9) * 0.03);
    w.lean = 0.06;
  },
  // At the smelter: hammer up slowly, strike fast.
  forge(w, t) {
    rest(w, t);
    const c = (t * 1.1) % 1;
    const up = c < 0.72 ? Math.sin((c / 0.72) * Math.PI / 2) : 1 - (c - 0.72) / 0.28;
    set(w.rS, -0.35 - 1.7 * up, 0, 0.15);
    set(w.rE, -0.5 + 0.35 * up, 0, 0);
    set(w.lS, -0.7, 0, -0.25);
    set(w.lE, -0.9, 0, 0.25);
    set(w.head, 0.28, 0, 0);
    w.lean = 0.1 - 0.05 * up;
  },
  // At the board: the -x arm points up at the screen and swipes, the other hand on the hip.
  present(w, t) {
    rest(w, t);
    set(w.lS, 0.35, 0, -2.3 + Math.sin(t * 1.6) * 0.15);
    set(w.lE, 0, 0, -0.35);
    set(w.rS, 0.15, 0, 0.42);
    set(w.rE, -0.35, 0, -1.6);
    set(w.head, -0.15, -0.45 + Math.sin(t * 0.8) * 0.1, 0);
  },
  // Waiting for permission: faces the camera and waves.
  wave(w, t) {
    rest(w, t);
    set(w.rS, -0.25, 0, 1.95);
    set(w.rE, 0, 0, 0.95 + Math.sin(t * 8) * 0.45);
    set(w.head, 0, 0, Math.sin(t * 4) * 0.1);
  },
  // At the arcade: hands on stick and buttons.
  play(w, t) {
    rest(w, t);
    set(w.rS, -0.85, 0, 0.18);
    set(w.rE, -0.95 + Math.sin(t * 17) * 0.07, 0, -0.12);
    set(w.lS, -0.85 + Math.sin(t * 6) * 0.06, 0, -0.18 + Math.sin(t * 4.3) * 0.06);
    set(w.lE, -0.95, 0, 0.12);
    set(w.head, 0.1, Math.sin(t * 2.7) * 0.06, 0);
    w.bob = Math.abs(Math.sin(t * 5)) * 0.015;
  },
  // StopFailure: head down, arms hanging.
  slump(w, t) {
    rest(w, t);
    set(w.rS, 0.12, 0, 0.06);
    set(w.rE, -0.1, 0, 0);
    set(w.lS, 0.12, 0, -0.06);
    set(w.lE, -0.1, 0, 0);
    set(w.head, 0.45, 0, Math.sin(t * 0.7) * 0.1);
    w.lean = 0.12;
    w.bob = -0.03;
  },
};

function walkPose(w, t, phase) {
  const s = Math.sin(phase);
  set(w.rS, 0.45 * s, 0, 0.12);
  set(w.rE, -0.45, 0, 0);
  set(w.lS, -0.45 * s, 0, -0.12);
  set(w.lE, -0.45, 0, 0);
  set(w.head, 0.05, 0, 0);
  w.hipR = -0.55 * s;
  w.hipL = 0.55 * s;
  w.lean = 0.08;
  w.bob = Math.abs(s) * 0.045;
}

function blend(cur, want, k) {
  for (const key of ['rS', 'rE', 'lS', 'lE', 'head']) {
    for (let i = 0; i < 3; i++) cur[key][i] += (want[key][i] - cur[key][i]) * k;
  }
  for (const key of ['hipR', 'hipL', 'lean', 'bob']) cur[key] += (want[key] - cur[key]) * k;
}

function apply(j, { armR, armL, head, hips, upper }) {
  armR.shoulder.rotation.set(...j.rS);
  armR.elbow.rotation.set(...j.rE);
  armL.shoulder.rotation.set(...j.lS);
  armL.elbow.rotation.set(...j.lE);
  head.rotation.set(...j.head);
  hips[1].rotation.x = j.hipR;
  hips[-1].rotation.x = j.hipL;
  upper.rotation.x = j.lean;
  upper.position.y = HIP_Y + j.bob;
}

/** Turns angle `a` towards `b` the short way round, by at most `max` radians. */
function turnTowards(a, b, max) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + Math.max(-max, Math.min(max, d));
}

/** Gives every mesh under `root` a copy of its material; returns a function that sets their opacity. */
function ownMaterials(root) {
  const copies = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (!copies.has(node.material)) copies.set(node.material, node.material.clone());
    node.material = copies.get(node.material);
  });
  const list = [...copies.values()].map((m) => ({ m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }));
  return (o) => {
    for (const { m, opacity, transparent, depthWrite } of list) {
      const fade = o < 0.999;
      m.opacity = opacity * o;
      if (m.transparent !== (transparent || fade)) {
        m.transparent = transparent || fade;
        m.needsUpdate = true;
      }
      m.depthWrite = fade ? false : depthWrite;
    }
  };
}
