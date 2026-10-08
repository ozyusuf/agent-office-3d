// The agent: a chibi hacker built from primitives (big head, messy hair, cyan visor, headphones,
// dark hoodie with cyan trims). Local +z is the front; feet at y = 0. Stage 4 moves and poses it.

import * as THREE from 'three';
import { P, rng, neon, solid, merged, flatRing } from './kit.js';

export function buildCharacter() {
  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group(); // bobs while breathing
  root.add(body);

  // A little self-light keeps skin and hair readable in the dark, cyan-lit scene.
  const skin = solid(0xf2c0a0, { roughness: 0.65, metalness: 0, env: 0.25, emissive: 0xc87a5a, emissiveIntensity: 0.42 });
  const hoodie = solid(0x262a3e, { roughness: 0.8, metalness: 0.05, env: 0.5 });
  const pants = solid(0x15182a, { roughness: 0.8, metalness: 0.05, env: 0.4 });
  const hair = solid(0x2e1a10, { roughness: 0.8, metalness: 0, env: 0.1, emissive: 0x52281a, emissiveIntensity: 0.75 });
  const gear = solid(0x1d2029, { roughness: 0.35, metalness: 0.6, env: 0.9 });
  const trim = neon(P.neonCyan, 1.7);

  // Legs and shoes
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.24, 4, 10), pants);
    leg.position.set(s * 0.11, 0.25, 0);
    body.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), solid(0x30364a, { roughness: 0.55, metalness: 0.2 }));
    shoe.scale.set(0.1, 0.07, 0.15);
    shoe.position.set(s * 0.12, 0.06, 0.04);
    body.add(shoe);
    const sole = flatRing(0.092, 0.01, neon(P.neonCyan, 1.3));
    sole.scale.set(1, 1.5, 1);
    sole.position.set(s * 0.12, 0.022, 0.04);
    body.add(sole);
  }

  // Torso (hoodie) with trims
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.24, 6, 16), hoodie);
  torso.scale.set(1.08, 1, 0.82);
  torso.position.y = 0.66;
  body.add(torso);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.236, 0.016, 6, 28), trim);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1.08, 0.82, 1);
  hem.position.y = 0.47;
  body.add(hem);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3, 0.01), trim);
  zip.position.set(0, 0.65, 0.196);
  body.add(zip);
  for (const s of [-1, 1]) {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 5), neon(P.text, 1.0));
    string.position.set(s * 0.06, 0.77, 0.2);
    body.add(string);
  }
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 20), hoodie);
  hood.rotation.x = Math.PI / 2 - 0.5;
  hood.position.set(0, 0.88, -0.1);
  body.add(hood);

  // Arms: left reaches to the console, right is raised (as in the reference pose).
  const arm = (side, shoulderRot, elbowRot) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 0.82, 0);
    shoulder.rotation.set(...shoulderRot);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.16, 4, 10), hoodie);
    upper.position.y = -0.12;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    elbow.rotation.set(...elbowRot);
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
    body.add(shoulder);
    return { shoulder, elbow };
  };
  arm(-1, [-0.9, 0, -0.25], [-0.6, 0, 0]);
  const right = arm(1, [-0.3, 0, 2.5], [0, 0, 0.6]);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.2;
  body.add(head);
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

  root.scale.setScalar(1.85);
  const headTop = new THREE.Vector3(0, 1.72, 0);

  return {
    root,
    headTop, // local point above the head, for the character label
    tick(t) {
      body.position.y = Math.sin(t * 2.2) * 0.012;
      head.rotation.z = Math.sin(t * 0.9) * 0.04;
      right.elbow.rotation.z = 0.6 + Math.sin(t * 1.7) * 0.08;
    },
  };
}
