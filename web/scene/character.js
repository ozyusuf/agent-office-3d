// The agent: a chibi hacker built from primitives (big head, messy hair, cyan visor, headphones,
// dark hoodie with cyan trims). Local +z is the front; feet at y = 0.
// It walks the network in walk.js to the spot the director picks (director.js) and works there in
// that spot's pose. While it stays, it moves between the spot's stands, fidgets now and then and
// glances at busy stations elsewhere (life.js), and it reacts to a few events (a new prompt, a
// failed call, a level up). Arms are named by their side in local space: `armR` is at +x, which is
// screen right while the character faces the camera.

import * as THREE from 'three';
import { P, TAU, rng, neon, solid, merged, flatRing, glowSprite, ease } from './kit.js';
import { SPOTS, YAW_CAMERA, planPath, pathLength, floorAt, spotPoint } from './walk.js';
import { roams, animFor, nextStand, dwell, pickFidget, fidgetGap, envelope, GESTURE_S } from './life.js';

const SCALE = 1.85;
const HIP_Y = 0.45; // local height of the hip joints
const STRIDE = 5.6; // walk cycle (radians) per world unit walked (at walking speed)
const WALK_S = 1.2; // a walk takes about this long: speed = length / WALK_S, within the limits below
const MIN_SPEED = 3.2; // world units per second
const MAX_SPEED = 7.5;
const STROLL_SPEED = 1.5; // between the stands of one spot
const FADE_S = 0.8; // appear / fade out time

/** @param {{ calm?: boolean }} options  calm = reduced motion: no strolling, fidgets or reactions */
export function buildCharacter({ calm = false } = {}) {
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
  let strolling = false; // the path is a short move between two stands of one spot
  let standAt = 0; // stand of the heading spot it is at (or strolls to); 0 = the spot itself
  let nextMove = 0; // when it moves to another stand
  let opacity = 0;
  let phase = 0; // walk cycle
  let moving = false;
  let clock = 0;
  let gesture = null; // { name, start, fidget }: a fidget or a reaction to an event
  let nextFidget = 3;
  let look = null; // world point of a busy station elsewhere, or null
  let glance = 0; // 0..1: how far the head is turned towards it
  const chance = rng(29); // choices of stands and fidgets

  const joints = makeJoints();
  const want = makeJoints();
  const extra = makeJoints();

  function place() {
    root.position.set(pos.x, footY, pos.z);
    root.rotation.y = yaw;
  }
  place();

  function walk(points, stroll) {
    path = points;
    strolling = stroll;
    const len = pathLength([pos.x, pos.z], path);
    speed = stroll ? STROLL_SPEED : Math.min(MAX_SPEED, Math.max(MIN_SPEED, len / WALK_S));
  }

  return {
    root,
    /** Writes the world point above the head (for the character label) into `out`. */
    headWorld(out) {
      return root.localToWorld(out.copy(headTop));
    },
    /** The pose it is in now ('walk' while walking to another spot). */
    pose: () => (moving && !strolling ? 'walk' : goal.pose),
    setGoal(next) {
      goal = next;
      if (next.spot === heading) {
        if (strolling && !roams(next.pose)) path = []; // waving, slumping: stop where it is
        return;
      }
      const from = heading;
      heading = next.spot;
      if (opacity < 0.05) {
        // Not visible: appear right at the spot instead of walking there.
        [pos.x, pos.z] = spotPoint(heading);
        footY = floorAt(pos.x, pos.z);
        path = [];
        standAt = 0;
        return;
      }
      // Away from the spot's own point (another stand), it first steps back to it: the network
      // only starts there.
      if (strolling || standAt !== 0) {
        const back = spotPoint(from);
        walk([back, ...planPath(back, heading)], false);
      } else {
        walk(planPath([pos.x, pos.z], heading), false);
      }
      standAt = 0;
    },
    /** A short reaction to a real event: 'ready' (new prompt), 'flinch' (failed call), 'cheer' (level up). */
    react(name) {
      if (!calm && opacity > 0.5) gesture = { name, start: clock, fidget: false };
    },
    /** World point to glance at now and then (a busy station it does not walk to), or null. */
    setLook(point) {
      look = point;
    },
    tick(t, dt) {
      clock = t;
      // Appear / fade out
      const target = goal.visible ? 1 : 0;
      if (opacity !== target) {
        opacity = target > opacity ? Math.min(1, opacity + dt / FADE_S) : Math.max(0, opacity - dt / FADE_S);
        fading(opacity);
        beam.visible = opacity > 0 && opacity < 1;
        beam.material.opacity = 0.75 * Math.sin(Math.PI * opacity);
      }
      root.visible = opacity > 0.004;

      // While it stays at a spot it moves to another of its stands now and then.
      const spot = SPOTS[heading];
      if (!path.length && t >= nextMove && roams(goal.pose) && !goal.faceCamera && !calm && opacity > 0.5) {
        const i = nextStand(spot.stands.length, standAt, chance);
        if (i !== standAt) {
          standAt = i;
          walk([spot.stands[i].at], true);
        }
        nextMove = t + pathLength([pos.x, pos.z], path) / STROLL_SPEED + dwell(goal.pose, i, chance);
      }

      // Walk along the path; long walks are run, so no walk takes much more than WALK_S.
      const wasMoving = moving;
      moving = path.length > 0;
      let face = goal.faceCamera ? YAW_CAMERA : spot.stands[standAt].yaw;
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
        if (!path.length && !strolling) nextMove = t + dwell(goal.pose, 0, chance); // arrived: work a while
        if (!path.length) strolling = false;
      }
      const turn = angleTo(yaw, face);
      yaw = turnTowards(yaw, face, dt * (moving ? 12 : 6));
      footY = ease(footY, floorAt(pos.x, pos.z), dt, 0.06);
      place();

      // Pose: the work at this stand (or the walk), a gesture on top, a glance, then blend.
      const anim = moving ? 'walk' : animFor(goal.pose, spot.stands[standAt].act);
      if (moving) walkPose(want, t, phase, strolling ? 0 : Math.min(1, Math.max(0, (speed - 2) / 4)));
      else (POSES[anim] ?? POSES.stand)(want, t);

      if (moving && !wasMoving && gesture?.fidget) gesture = null;
      if (!gesture && !moving && !calm && t >= nextFidget) {
        const name = pickFidget(anim, chance);
        if (name) gesture = { name, start: t, fidget: true };
        nextFidget = t + fidgetGap(anim, chance) + (name ? GESTURE_S[name] : 0);
      }
      if (gesture) {
        const k = (t - gesture.start) / GESTURE_S[gesture.name];
        if (k >= 1) {
          gesture = null;
        } else {
          copyJoints(extra, want);
          GESTURES[gesture.name](extra, t, k);
          if (moving) Object.assign(extra, { hipR: want.hipR, hipL: want.hipL, lift: 0 }); // the legs keep walking
          mix(want, extra, envelope(k));
        }
      }

      // Glance at a busy station elsewhere (the Terminal while a command runs, the orbit sphere for
      // the web, the portal while helpers are out): in short looks while working, longer when free.
      let rel = 0;
      let up = 0;
      if (look) {
        const dx = look.x - pos.x;
        const dz = look.z - pos.z;
        rel = angleTo(yaw, Math.atan2(dx, dz));
        up = Math.atan2(look.y - (footY + 2.2), Math.hypot(dx, dz));
      }
      const free = anim === 'stand' || anim === 'think' || anim === 'study';
      const wantGlance = look && !moving && LOOKS.has(anim) && Math.abs(rel) < 2 && (free || t % 4.5 < 1.8) ? 1 : 0;
      glance = ease(glance, wantGlance, dt, 0.25);
      if (glance > 0.001) {
        want.head[1] += (Math.max(-1.1, Math.min(1.1, rel)) - want.head[1]) * glance;
        want.head[0] += (-Math.max(-0.35, Math.min(0.5, up)) * 0.8 - want.head[0]) * glance;
      }

      // Turning on the spot: small steps instead of sliding round.
      if (!moving && Math.abs(turn) > 0.12) {
        phase += dt * 10;
        want.hipR = -0.28 * Math.sin(phase);
        want.hipL = 0.28 * Math.sin(phase);
      }

      blend(joints, want, 1 - Math.exp(-dt * 10));
      apply(joints, { armR, armL, head, hips, upper, body });
    },
  };
}

// ---- Poses ----

const JOINTS3 = ['rS', 'rE', 'lS', 'lE', 'head'];
const JOINTS1 = ['hipR', 'hipL', 'lean', 'bob', 'twist', 'sway', 'lift'];

function makeJoints() {
  const j = { rS: [0, 0, 0], rE: [0, 0, 0], lS: [0, 0, 0], lE: [0, 0, 0], head: [0, 0, 0] };
  for (const key of JOINTS1) j[key] = 0;
  return j;
}

function copyJoints(to, from) {
  for (const key of JOINTS3) for (let i = 0; i < 3; i++) to[key][i] = from[key][i];
  for (const key of JOINTS1) to[key] = from[key];
}

/** Moves `cur` towards `want` by k (0..1). */
function mix(cur, want, k) {
  for (const key of JOINTS3) for (let i = 0; i < 3; i++) cur[key][i] += (want[key][i] - cur[key][i]) * k;
  for (const key of JOINTS1) cur[key] += (want[key] - cur[key]) * k;
}
const blend = mix;

const set = (v, x, y, z) => {
  v[0] = x;
  v[1] = y;
  v[2] = z;
};

// Animations in which the head may turn to glance at another station.
const LOOKS = new Set(['stand', 'type', 'code', 'think', 'study', 'swipe']);

function rest(w, t) {
  set(w.rS, 0.05, 0, 0.13 + Math.sin(t * 1.1) * 0.025);
  set(w.rE, -0.25, 0, 0);
  set(w.lS, 0.05, 0, -0.13 - Math.sin(t * 1.1 + 1) * 0.025);
  set(w.lE, -0.25, 0, 0);
  set(w.head, Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.37) * 0.16, Math.sin(t * 0.9) * 0.04);
  w.hipR = 0;
  w.hipL = 0;
  w.lean = 0;
  w.bob = Math.sin(t * 2.2) * 0.012; // breathing
  w.twist = Math.sin(t * 0.45) * 0.05;
  w.sway = Math.sin(t * 0.7) * 0.03; // weight from one foot to the other
  w.lift = 0;
}

const POSES = {
  stand: rest,
  // At the desk: both hands on the holo keyboard; eyes on the keys, now and then up at the screens.
  type(w, t) {
    rest(w, t);
    set(w.rS, -0.95, 0, 0.2);
    set(w.rE, -0.75 + Math.sin(t * 14) * 0.09, 0, -0.18);
    set(w.lS, -0.95, 0, -0.2);
    set(w.lE, -0.75 + Math.sin(t * 14 + 1.9) * 0.09, 0, 0.18);
    const up = Math.max(0, Math.sin(t * 0.7)) ** 3;
    set(w.head, 0.22 - 0.36 * up + Math.sin(t * 3.1) * 0.025, Math.sin(t * 0.43) * 0.2 * up, Math.sin(t * 0.9) * 0.03);
    w.lean = 0.06 + Math.sin(t * 0.6) * 0.02;
    w.sway = Math.sin(t * 0.8) * 0.02;
  },
  // At the editor's keyboard: types, eyes on the monitor (to its +x side).
  code(w, t) {
    POSES.type(w, t);
    set(w.head, 0.06 + Math.sin(t * 2.3) * 0.03, 0.42 + Math.sin(t * 0.5) * 0.1, Math.sin(t * 0.9) * 0.03);
    w.twist = 0.08;
  },
  // At a holo panel: one hand swipes over it.
  swipe(w, t) {
    rest(w, t);
    const s = Math.sin(t * 2.4);
    set(w.rS, -1.45 + Math.sin(t * 1.2) * 0.1, 0, 0.3 + s * 0.35);
    set(w.rE, -0.35, 0, -0.2);
    set(w.lS, 0.1, 0, -0.15);
    set(w.lE, -0.4, 0, 0);
    set(w.head, -0.12, s * 0.08, 0);
    w.lean = -0.02;
    w.twist = -0.06 + s * 0.05;
  },
  // Thinking: a hand at the chin, the other arm across, head tilted.
  think(w, t) {
    rest(w, t);
    set(w.rS, -0.8, 0, -0.45);
    set(w.rE, -2.0, 0, 0);
    set(w.lS, -0.35, 0, 0.25);
    set(w.lE, -1.45, 0, 0);
    set(w.head, -0.18 + Math.sin(t * 0.8) * 0.05, Math.sin(t * 0.35) * 0.3, 0.12);
    w.sway = Math.sin(t * 0.6) * 0.04;
  },
  // A step back from the board or the monitor: hands on the hips, looking at it, nodding.
  study(w, t) {
    rest(w, t);
    set(w.rS, 0.15, 0, 0.42);
    set(w.rE, -0.35, 0, -1.6);
    set(w.lS, 0.15, 0, -0.42);
    set(w.lE, -0.35, 0, 1.6);
    set(w.head, -0.2 + Math.sin(t * 1.7) * 0.05, Math.sin(t * 0.4) * 0.2, 0);
    w.lean = -0.04;
  },
  // Explaining the code to the rubber duck: both hands talk, head nods.
  duck(w, t) {
    rest(w, t);
    const a = Math.sin(t * 3.2);
    const b = Math.sin(t * 3.2 + 2.1);
    set(w.rS, -0.75 + a * 0.18, 0, 0.3 + b * 0.1);
    set(w.rE, -0.9 + b * 0.3, 0, -0.35);
    set(w.lS, -0.75 + b * 0.18, 0, -0.3 - a * 0.1);
    set(w.lE, -0.9 + a * 0.3, 0, 0.35);
    set(w.head, 0.32 + Math.sin(t * 4.1) * 0.06, Math.sin(t * 0.9) * 0.1, Math.sin(t * 1.3) * 0.08);
    w.lean = 0.12;
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
  // At the arcade: hands on stick and buttons, swaying with the game.
  play(w, t) {
    rest(w, t);
    set(w.rS, -0.85, 0, 0.18);
    set(w.rE, -0.95 + Math.sin(t * 17) * 0.07, 0, -0.12);
    set(w.lS, -0.85 + Math.sin(t * 6) * 0.06, 0, -0.18 + Math.sin(t * 4.3) * 0.06);
    set(w.lE, -0.95, 0, 0.12);
    set(w.head, 0.1, Math.sin(t * 2.7) * 0.06, 0);
    w.bob = Math.abs(Math.sin(t * 5)) * 0.015;
    w.sway = Math.sin(t * 4.3) * 0.04;
    w.lean = 0.05;
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
    w.twist = 0;
    w.sway = 0;
  },
};

// Gestures on top of the pose; `k` = progress 0..1 (life.js gives their length and the envelope).
const GESTURES = {
  // look round to one side, then the other
  look(w, t, k) {
    w.head[0] = -0.08;
    w.head[1] = Math.sin(k * TAU) * 0.85;
  },
  stretch(w) {
    set(w.rS, -0.25, 0, 2.7);
    set(w.rE, 0, 0, 0.35);
    set(w.lS, -0.25, 0, -2.7);
    set(w.lE, 0, 0, -0.35);
    w.head[0] = -0.3;
    w.lean = -0.12;
    w.lift = 0.03;
  },
  // a hand on the headphones, nodding to the music
  music(w, t) {
    const beat = Math.sin(t * TAU * 1.6);
    set(w.rS, -0.15, 0, 1.45);
    set(w.rE, 0, 0, 2.1);
    set(w.head, 0.12 * beat, w.head[1], 0.08 * Math.sin(t * TAU * 0.8));
    w.bob = 0.02 * Math.abs(beat);
    w.sway = 0.06 * Math.sin(t * TAU * 0.8);
  },
  // both hands push the headphones on
  headphones(w) {
    set(w.rS, -0.15, 0, 1.45);
    set(w.rE, 0, 0, 2.1);
    set(w.lS, -0.15, 0, -1.45);
    set(w.lE, 0, 0, -2.1);
    w.head[2] = 0;
  },
  hop(w, t, k) {
    const h = Math.sin(Math.PI * k);
    w.lift = 0.16 * h;
    w.hipR = -0.3 * h;
    w.hipL = 0.15 * h;
    set(w.rS, -0.3, 0, 0.5 + 0.6 * h);
    set(w.lS, -0.3, 0, -0.5 - 0.6 * h);
  },
  // arms out in front, a stretch of the fingers
  crack(w) {
    set(w.rS, -1.5, 0, 0.12);
    set(w.rE, 0, 0, 0);
    set(w.lS, -1.5, 0, -0.12);
    set(w.lE, 0, 0, 0);
    w.lean = -0.05;
    w.head[0] = 0;
  },
  cheer(w, t) {
    const p = Math.abs(Math.sin(t * 9));
    set(w.rS, -0.3, 0, 2.45 + 0.25 * p);
    set(w.rE, 0, 0, 0.4);
    set(w.lS, -0.3, 0, -2.45 - 0.25 * p);
    set(w.lE, 0, 0, -0.4);
    w.head[0] = -0.3;
    w.lift = 0.07 * p;
  },
  // leans back from the game
  lean(w) {
    w.lean = -0.18;
    w.head[0] = -0.1;
  },
  // a call failed: shoulders up, a shake of the head
  flinch(w, t, k) {
    set(w.rS, -0.4, 0, 0.55);
    set(w.rE, -1.3, 0, 0);
    set(w.lS, -0.4, 0, -0.55);
    set(w.lE, -1.3, 0, 0);
    set(w.head, -0.25, Math.sin(t * 30) * 0.15 * (1 - k), 0);
    w.lean = -0.16;
    w.bob = -0.02;
  },
  // a new prompt: fists up, a little jump, ready to go
  ready(w, t, k) {
    const h = Math.sin(Math.PI * k);
    set(w.rS, -1.1, 0, 0.35);
    set(w.rE, -1.7, 0, 0);
    set(w.lS, -1.1, 0, -0.35);
    set(w.lE, -1.7, 0, 0);
    w.head[0] = -0.15;
    w.lift = 0.1 * h;
  },
};

/** Walking (run 0) to running (run 1): arms swing against the legs, shoulders against the hips. */
function walkPose(w, t, phase, run) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const arm = 0.4 + 0.3 * run;
  set(w.rS, arm * s, 0, 0.12 + 0.06 * run);
  set(w.rE, -0.45 - 0.5 * run, 0, 0);
  set(w.lS, -arm * s, 0, -0.12 - 0.06 * run);
  set(w.lE, -0.45 - 0.5 * run, 0, 0);
  set(w.head, 0.05, -0.1 * s, 0.03 * c);
  w.hipR = -(0.5 + 0.15 * run) * s;
  w.hipL = (0.5 + 0.15 * run) * s;
  w.lean = 0.06 + 0.12 * run;
  w.bob = Math.abs(s) * (0.04 + 0.03 * run);
  w.twist = 0.12 * s;
  w.sway = 0.035 * c;
  w.lift = 0;
}

function apply(j, { armR, armL, head, hips, upper, body }) {
  armR.shoulder.rotation.set(...j.rS);
  armR.elbow.rotation.set(...j.rE);
  armL.shoulder.rotation.set(...j.lS);
  armL.elbow.rotation.set(...j.lE);
  head.rotation.set(...j.head);
  hips[1].rotation.x = j.hipR;
  hips[-1].rotation.x = j.hipL;
  upper.rotation.set(j.lean, j.twist, j.sway);
  upper.position.y = HIP_Y + j.bob;
  body.position.y = j.lift;
}

/** Signed angle from `a` to `b`, the short way round. */
function angleTo(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Turns angle `a` towards `b` the short way round, by at most `max` radians. */
function turnTowards(a, b, max) {
  const d = angleTo(a, b);
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
