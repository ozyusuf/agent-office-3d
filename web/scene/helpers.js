// Helper bots: one small drone per running subagent (one per agent_id in the server state).
// It rises out of the big portal (SubagentStart), hovers near the station its current call uses or
// circles the portal while it thinks, and flies back down into the portal (SubagentStop).

import * as THREE from 'three';
import { P, TAU, FACE_CAMERA, neon, solid, glowSprite, flatRing, trackAccent } from './kit.js';
import { stationForKind } from '../stations.js';

const MAX_BOTS = 8;
const SIZE = 1.6; // bot scale (body radius 0.3 -> about 0.5 world units) // more helpers than this still count in the log, they just share the sky
const RISE_S = 0.9;
const SINK_S = 0.8;

/**
 * @param {THREE.Scene} scene
 * @param {{ portal: THREE.Vector3, hovers: Record<string, THREE.Vector3> }} places
 * @param {(n: number) => void} onPortal  called with +1 / -1 when a bot comes out of / goes into the portal
 */
export function buildHelpers(scene, { portal, hovers }, onPortal) {
  // Shared parts (bots never fade their materials; they grow and shrink instead).
  const geo = {
    body: new THREE.SphereGeometry(0.3, 20, 14),
    eye: new THREE.SphereGeometry(0.075, 12, 8),
    stalk: new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6),
    tip: new THREE.SphereGeometry(0.045, 10, 8),
  };
  const mat = {
    body: solid(0x2b3150, { roughness: 0.35, metalness: 0.7, env: 1 }),
    band: neon(P.neonCyan, 2.4),
    eye: neon(P.neonCyanSoft, 3.2),
    tip: neon(P.neonMagenta, 3),
  };
  const above = portal.clone().add(new THREE.Vector3(0, 1.0, 0));
  const below = portal.clone().add(new THREE.Vector3(0, -0.5, 0));

  const pool = [];
  const bots = new Map(); // agent id -> bot

  function makeBot() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo.body, mat.body));
    const band = flatRing(0.3, 0.03, mat.band);
    g.add(band);
    const eye = new THREE.Mesh(geo.eye, mat.eye);
    eye.position.set(0, 0.06, 0.27);
    g.add(eye);
    const stalk = new THREE.Mesh(geo.stalk, mat.body);
    stalk.position.y = 0.38;
    g.add(stalk);
    const tip = new THREE.Mesh(geo.tip, mat.tip);
    tip.position.y = 0.5;
    g.add(tip);
    const jet = glowSprite(P.neonCyan, 0.9, 0.6); // thruster glow underneath
    jet.position.y = -0.35;
    g.add(jet);
    g.visible = false;
    scene.add(g);
    trackAccent(g); // built after the scene: takes the current accent colour
    return { g, jet, pos: new THREE.Vector3(), seed: Math.random() * TAU };
  }

  function spawn(id) {
    const bot = pool.pop() ?? makeBot();
    Object.assign(bot, { id, state: 'rise', k: 0, kind: null });
    bot.pos.copy(below);
    bot.g.visible = true;
    bots.set(id, bot);
    onPortal(1);
  }

  const target = new THREE.Vector3();
  function hoverPoint(bot, index, count, t) {
    const station = bot.kind ? stationForKind(bot.kind) : 'portal';
    const at = station !== 'portal' ? hovers[station] : null;
    if (at) {
      // Near the station's work, spread out when several helpers share it.
      const a = index * 2.2 + bot.seed;
      return target.set(at.x + Math.cos(a) * 0.7, at.y + Math.sin(t * 1.3 + bot.seed) * 0.12, at.z + Math.sin(a) * 0.7);
    }
    // Thinking: circle the portal.
    const a = t * 0.35 + (index / Math.max(1, count)) * TAU;
    return target.set(portal.x + Math.cos(a) * 2.6, portal.y + 0.8 + Math.sin(t * 1.1 + bot.seed) * 0.15, portal.z + Math.sin(a) * 2.6);
  }

  return {
    /** Server state helpers: [{ id, agentType, kind }]. */
    sync(list) {
      const ids = new Set();
      for (const h of list.slice(0, MAX_BOTS)) {
        ids.add(h.id);
        if (!bots.has(h.id)) spawn(h.id);
        const bot = bots.get(h.id);
        bot.kind = h.kind;
        if (bot.state === 'leave') bot.state = 'fly'; // still working after all
      }
      for (const bot of bots.values()) {
        if (!ids.has(bot.id) && (bot.state === 'rise' || bot.state === 'fly')) bot.state = 'leave';
      }
    },
    tick(t, dt) {
      const flying = [...bots.values()].filter((b) => b.state === 'fly');
      for (const bot of bots.values()) {
        let scale = 1;
        if (bot.state === 'rise') {
          bot.k = Math.min(1, bot.k + dt / RISE_S);
          bot.pos.lerpVectors(below, above, 1 - (1 - bot.k) ** 2);
          scale = bot.k;
          if (bot.k >= 1) bot.state = 'fly';
        } else if (bot.state === 'fly') {
          const goal = hoverPoint(bot, flying.indexOf(bot), flying.length, t);
          bot.pos.lerp(goal, 1 - Math.exp(-dt * 2.2));
        } else if (bot.state === 'leave') {
          bot.pos.lerp(above, 1 - Math.exp(-dt * 3));
          if (bot.pos.distanceTo(above) < 0.25) {
            bot.state = 'sink';
            bot.k = 0;
            onPortal(-1);
          }
        } else if (bot.state === 'sink') {
          bot.k = Math.min(1, bot.k + dt / SINK_S);
          bot.pos.lerpVectors(above, below, bot.k ** 2);
          scale = 1 - bot.k;
          if (bot.k >= 1) {
            bot.g.visible = false;
            bots.delete(bot.id);
            pool.push(bot);
            continue;
          }
        }
        bot.g.position.copy(bot.pos);
        bot.g.position.y += Math.sin(t * 2.4 + bot.seed) * 0.05 * scale;
        bot.g.scale.setScalar(Math.max(0.001, scale) * SIZE);
        bot.g.rotation.y = FACE_CAMERA + Math.sin(t * 0.7 + bot.seed) * 0.4; // looks at the camera, a little curious
        bot.jet.material.opacity = 0.45 + 0.25 * Math.sin(t * 17 + bot.seed);
      }
    },
  };
}
