// One-off celebrations, each caused by a real event: a level up (the XP from finished tool calls
// crossed a level) throws sparks out of the character and sends a ring of light over the dais.

import * as THREE from 'three';
import { P, TAU, TEX, rng, live } from './kit.js';

const SPARKS = 72;
const LIFE_S = 1.9;

export function createEffects(scene, { calm = false } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SPARKS * 3);
  const col = new Float32Array(SPARKS * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 6, sizeAttenuation: false, map: TEX.glow, vertexColors: true, transparent: true,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 72), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const rand = rng(91);
  const sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), delay: 0 }));
  let started = -1;
  let clock = 0;
  const gold = new THREE.Color(0xffcf7a);

  return {
    /** A level up at `at` (the character's feet). */
    levelUp(at) {
      started = clock;
      const accent = new THREE.Color(live(P.neonCyanSoft));
      for (const s of sparks) {
        const a = rand() * TAU;
        const up = 2.4 + rand() * 2.6;
        const out = 0.6 + rand() * 1.6;
        s.p.copy(at).add(new THREE.Vector3(0, 0.6 + rand() * 0.5, 0));
        s.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
        s.c.copy(rand() < 0.7 ? gold : accent).multiplyScalar(1.6 + rand() * 1.2);
        s.delay = rand() * 0.25;
      }
      ring.position.set(at.x, at.y + 0.22, at.z);
      ring.material.color.copy(gold);
      points.visible = !calm; // reduced motion: only the ring of light
      ring.visible = true;
    },
    /** A burst is playing (the realm draws at full rate meanwhile). */
    busy: () => started >= 0,
    tick(t, dt) {
      clock += dt;
      if (started < 0) return;
      const age = clock - started;
      if (age > LIFE_S + 0.3) {
        started = -1;
        points.visible = false;
        ring.visible = false;
        return;
      }
      sparks.forEach((s, i) => {
        const k = age - s.delay;
        if (k > 0) {
          s.v.y -= dt * 3.2; // a gentle arc back down
          s.v.multiplyScalar(1 - dt * 0.6);
          s.p.addScaledVector(s.v, dt);
        }
        const fade = k <= 0 ? 0 : Math.max(0, 1 - k / LIFE_S) * (0.75 + 0.25 * Math.sin(k * 30 + i));
        pos.set([s.p.x, s.p.y, s.p.z], i * 3);
        col.set([s.c.r * fade, s.c.g * fade, s.c.b * fade], i * 3);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      const r = Math.min(1, age / 1.1);
      ring.scale.setScalar(0.4 + 3.4 * (1 - (1 - r) ** 3));
      ring.material.opacity = (1 - r) * 0.9;
    },
  };
}
