// Shared building blocks for the realm: materials, procedural canvas textures and geometry helpers.
// Everything is generated in code (no downloaded assets). Materials are cached and shared.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE as P } from '../palette.js';

export { P };
export const TAU = Math.PI * 2;
/** Rotation that turns a part's +z towards the camera (the camera looks from +x +z). */
export const FACE_CAMERA = Math.PI / 4;

// ---- Deterministic randomness (the scene looks the same on every load) ----

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Materials ----

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/**
 * Unlit glowing material. Intensity > 1 is HDR and crosses the bloom threshold.
 * opts: opacity, additive, side, map
 */
export function neon(color, intensity = 2, opts = {}) {
  const { opacity = 1, additive = false, side = THREE.FrontSide } = opts;
  return cached(`neon|${color}|${intensity}|${opacity}|${additive}|${side}`, () => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side });
    if (opacity < 1 || additive) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    if (additive) m.blending = THREE.AdditiveBlending;
    return m;
  });
}

/** Lit surface. Shared per parameter set. */
export function solid(color, { roughness = 0.6, metalness = 0.4, env = 0.7, map = null, emissive = 0x000000, emissiveIntensity = 1 } = {}) {
  const key = `solid|${color}|${roughness}|${metalness}|${env}|${map?.uuid ?? ''}|${emissive}|${emissiveIntensity}`;
  return cached(key, () => new THREE.MeshStandardMaterial({
    color, roughness, metalness, map, envMapIntensity: env, emissive, emissiveIntensity,
  }));
}

export const MAT = {
  get hull() { return solid(0x2a2d42, { roughness: 0.55, metalness: 0.55 }); },
  get hullDark() { return solid(0x171a2a, { roughness: 0.6, metalness: 0.5 }); },
  get pipe() { return solid(0x50535e, { roughness: 0.32, metalness: 0.75, env: 1 }); },
  get pipeDark() { return solid(0x2e3038, { roughness: 0.4, metalness: 0.7, env: 0.9 }); },
  get trim() { return solid(0x5d6276, { roughness: 0.35, metalness: 0.8, env: 1 }); },
};

// ---- Canvas textures ----

function canvasTexture(w, h, draw, { color = true, wrap = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export const TEX = {
  /** Soft round glow (white -> transparent), for halos, flames, haze, particles. */
  get glow() {
    return cached('tex|glow', () => canvasTexture(64, 64, (g, w) => {
      const r = w / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }));
  },

  /** Tall flame tongue: bright base, tapering tip. */
  get flame() {
    return cached('tex|flame', () => canvasTexture(64, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.5);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.bezierCurveTo(w * 0.95, h * 0.45, w, h * 0.95, w / 2, h);
      g.bezierCurveTo(0, h * 0.95, w * 0.05, h * 0.45, w / 2, 0);
      g.fill();
    }));
  },

  /** Metal floor plates (4 x 4 world units per tile). */
  get floor() {
    return cached('tex|floor', () => {
      const tex = canvasTexture(256, 256, (g, w) => {
        const rand = rng(7);
        g.fillStyle = '#262a40';
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 1400; i++) {
          g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rand() * 0.04})`;
          g.fillRect(rand() * w, rand() * w, 1 + rand() * 3, 1);
        }
        const cell = w / 2;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const x = i * cell;
            const y = j * cell;
            g.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
            g.fillRect(x + 3, y + 3, cell - 6, cell - 6);
            g.strokeStyle = 'rgba(120,130,170,0.35)';
            g.lineWidth = 1;
            g.strokeRect(x + 3.5, y + 3.5, cell - 7, cell - 7);
            g.fillStyle = 'rgba(150,160,200,0.45)';
            for (const [bx, by] of [[9, 9], [cell - 9, 9], [9, cell - 9], [cell - 9, cell - 9]]) {
              g.beginPath();
              g.arc(x + bx, y + by, 1.6, 0, TAU);
              g.fill();
            }
          }
        }
        g.strokeStyle = '#0a0b14';
        g.lineWidth = 4;
        g.strokeRect(0, 0, w, w);
        g.beginPath();
        g.moveTo(w / 2, 0);
        g.lineTo(w / 2, w);
        g.moveTo(0, w / 2);
        g.lineTo(w, w / 2);
        g.stroke();
      }, { wrap: true });
      tex.repeat.set(0.25, 0.25);
      return tex;
    });
  },

  /** Platform side walls: horizontal panel seams. */
  get wall() {
    return cached('tex|wall', () => {
      const tex = canvasTexture(128, 64, (g, w, h) => {
        g.fillStyle = '#1d2033';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#0b0c16';
        g.fillRect(0, h * 0.42, w, 3);
        g.fillRect(w - 3, 0, 3, h);
        g.fillStyle = 'rgba(150,160,210,0.18)';
        g.fillRect(0, h * 0.42 + 3, w, 1);
        g.fillRect(0, 0, w, 1);
      }, { wrap: true });
      tex.repeat.set(0.5, 1.2);
      return tex;
    });
  },

  /** Vertical streaks for the data falls (scrolled in the shader via offset). */
  get falls() {
    return cached('tex|falls', () => canvasTexture(64, 256, (g, w, h) => {
      const rand = rng(11);
      g.fillStyle = 'rgba(0,0,0,0)';
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = rand() * w;
        const len = 20 + rand() * 120;
        const y = rand() * h;
        const a = 0.25 + rand() * 0.75;
        const lw = 1 + rand() * 2.5;
        for (const dy of [0, -h]) {
          const grad = g.createLinearGradient(0, y + dy, 0, y + dy + len);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.7, `rgba(255,255,255,${a})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.fillRect(x, y + dy, lw, len);
        }
      }
    }, { wrap: true }));
  },

  /** Alpha mask: fades a plane in at the top and out at the bottom. */
  get fadeV() {
    return cached('tex|fadeV', () => canvasTexture(4, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.12, '#fff');
      grad.addColorStop(0.8, '#fff');
      grad.addColorStop(1, '#000');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }, { color: false }));
  },

  /** Concentric ripple rings (basins, dais). */
  get ripple() {
    return cached('tex|ripple', () => canvasTexture(128, 128, (g, w) => {
      const r = w / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      for (let i = 1; i <= 5; i++) {
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(r, r, (r - 2) * (i / 5), 0.3 * i, 0.3 * i + Math.PI * 1.4);
        g.stroke();
      }
    }));
  },

  /** Dashed ring segments for portals and the dais. */
  get dashes() {
    return cached('tex|dashes', () => canvasTexture(256, 256, (g, w) => {
      const r = w / 2;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath();
        g.arc(r, r, r - 8, a, a + TAU / 48);
        g.stroke();
      }
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(r, r, r - 20, 0, TAU);
      g.stroke();
    }));
  },

  /** Abstract "code" for the holo board: coloured bars only, no characters or numbers. */
  get board() {
    return cached('tex|board', () => canvasTexture(512, 300, (g, w, h) => {
      const rand = rng(23);
      g.fillStyle = 'rgba(8,40,86,0.72)';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,200,240,0.9)';
      g.lineWidth = 3;
      g.strokeRect(2, 2, w - 4, h - 4);
      // title bar
      g.fillStyle = 'rgba(80,200,240,0.25)';
      g.fillRect(4, 4, w - 8, 18);
      for (const [x, c] of [[12, '#ff6b8a'], [26, '#f4c752'], [40, '#56d999']]) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, 13, 4, 0, TAU);
        g.fill();
      }
      // file tree column
      g.fillStyle = 'rgba(10,24,50,0.7)';
      g.fillRect(8, 28, 92, h - 36);
      for (let y = 38; y < h - 16; y += 14) {
        const indent = rand() < 0.4 ? 14 : 4;
        g.fillStyle = rand() < 0.15 ? 'rgba(241,173,86,0.9)' : 'rgba(140,200,240,0.65)';
        g.fillRect(14 + indent, y, 18 + rand() * 46, 5);
      }
      // code area
      const colors = ['#4fc3e4', '#56d999', '#f4c752', '#e350a4', '#c9d8ff', '#8f7ee6'];
      for (let y = 34; y < h - 12; y += 12) {
        let x = 112 + Math.floor(rand() * 4) * 12;
        const tokens = 1 + Math.floor(rand() * 5);
        for (let i = 0; i < tokens && x < 400; i++) {
          const len = 10 + rand() * 46;
          g.fillStyle = colors[Math.floor(rand() * colors.length)];
          g.globalAlpha = 0.65 + rand() * 0.35;
          g.fillRect(x, y, len, 5);
          x += len + 6;
        }
        g.globalAlpha = 1;
      }
      // right panels
      g.strokeStyle = 'rgba(80,200,240,0.7)';
      g.lineWidth = 2;
      g.strokeRect(412, 34, 90, 110);
      g.strokeRect(412, 154, 90, h - 166);
      for (let y = 46; y < 136; y += 12) {
        g.fillStyle = 'rgba(86,217,153,0.75)';
        g.fillRect(420, y, 20 + rand() * 50, 4);
      }
      for (let y = 166; y < h - 20; y += 12) {
        g.fillStyle = 'rgba(244,199,82,0.7)';
        g.fillRect(420, y, 16 + rand() * 54, 4);
      }
    }));
  },

  /** Planet surface (equirectangular): blue body, lat/long grid, abstract land. */
  get planet() {
    return cached('tex|planet', () => canvasTexture(256, 128, (g, w, h) => {
      const rand = rng(31);
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1b4f8f');
      grad.addColorStop(0.5, '#2c78b9');
      grad.addColorStop(1, '#173f78');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(110,220,255,${0.15 + rand() * 0.3})`;
        g.beginPath();
        g.ellipse(rand() * w, h * 0.2 + rand() * h * 0.6, 8 + rand() * 26, 4 + rand() * 12, rand() * 3, 0, TAU);
        g.fill();
      }
      g.strokeStyle = 'rgba(160,235,255,0.55)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += w / 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = h / 8; y < h; y += h / 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    }));
  },

  /** Arcade screen: simple pixel-art scene (decoration only). */
  get arcade() {
    return cached('tex|arcade', () => {
      const tex = canvasTexture(32, 32, (g, w, h) => {
        g.fillStyle = '#0d0830';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#56d999';
        for (const [x, y] of [[6, 6], [14, 6], [22, 6], [10, 11], [18, 11]]) {
          g.fillRect(x, y, 4, 3);
          g.fillRect(x - 1, y + 1, 6, 1);
        }
        g.fillStyle = '#4fc3e4';
        g.fillRect(14, 25, 5, 2);
        g.fillRect(16, 23, 1, 2);
        g.fillStyle = '#e350a4';
        g.fillRect(0, 29, w, 1);
        g.fillStyle = '#f4c752';
        g.fillRect(16, 17, 1, 2);
      });
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return tex;
    });
  },

  /** Server rack front: drive bays. */
  get rack() {
    return cached('tex|rack', () => canvasTexture(64, 192, (g, w, h) => {
      g.fillStyle = '#121626';
      g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 8; y += 14) {
        g.fillStyle = '#080a14';
        g.fillRect(5, y, w - 10, 10);
        g.fillStyle = 'rgba(120,150,200,0.35)';
        g.fillRect(5, y, w - 10, 1);
        g.fillStyle = 'rgba(60,80,120,0.6)';
        for (let x = 9; x < w - 26; x += 4) g.fillRect(x, y + 3, 2, 5);
      }
    }));
  },

  /** Falling glyph blocks for the background data columns (abstract, no characters). */
  get glyphs() {
    return cached('tex|glyphs', () => canvasTexture(32, 256, (g, w, h) => {
      const rand = rng(41);
      for (let y = 0; y < h; y += 8) {
        if (rand() < 0.25) continue;
        for (let x = 2; x < w - 4; x += 8) {
          if (rand() < 0.45) continue;
          g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.75})`;
          const bw = 2 + Math.floor(rand() * 4);
          g.fillRect(x, y + 1, bw, 2 + Math.floor(rand() * 4));
        }
      }
    }, { wrap: true }));
  },

  /** Background: dark navy centre fading to the void. */
  get sky() {
    return cached('tex|sky', () => canvasTexture(256, 512, (g, w, h) => {
      const grad = g.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, h * 0.62);
      grad.addColorStop(0, '#0c1d33');
      grad.addColorStop(0.45, '#061026');
      grad.addColorStop(1, '#03030f');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const blob = (x, y, r, c) => {
        const b = g.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, c);
        b.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = b;
        g.fillRect(0, 0, w, h);
      };
      blob(w * 0.15, h * 0.22, w * 0.6, 'rgba(70,40,120,0.22)');
      blob(w * 0.9, h * 0.7, w * 0.55, 'rgba(20,90,140,0.18)');
    }));
  },
};

// ---- Geometry helpers ----

/** Rectangle with cut corners, centred on the origin, as a 2D outline. */
export function chamferOutline(w, d, c) {
  const x = w / 2;
  const z = d / 2;
  return [
    [-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c],
    [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c],
  ];
}

/**
 * Floating metal platform: chamfered slab with plated top, panelled sides, neon rim strip and
 * small slit lights on the two camera-facing sides. Returns a Group placed in world space.
 */
export function platform({ x = 0, z = 0, w, d, top = 0, h = 0.8, chamfer = 1, rim = P.neonCyan, rimGlow = 2.0, slits = null }) {
  const group = new THREE.Group();
  group.position.set(x, top, z);

  const shape = new THREE.Shape(chamferOutline(w, d, chamfer).map(([px, pz]) => new THREE.Vector2(px, -pz)));
  const bevel = 0.05;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h - bevel, 0);
  const slab = new THREE.Mesh(geo, [
    solid(0xffffff, { map: TEX.floor, roughness: 0.5, metalness: 0.5, env: 0.8 }),
    solid(0xffffff, { map: TEX.wall, roughness: 0.55, metalness: 0.5, env: 0.8 }),
  ]);
  group.add(slab);

  // Neon rim along the top edge, slightly inset.
  const rimParts = [];
  const outline = chamferOutline(w - 0.22, d - 0.22, chamfer * 0.9);
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % outline.length];
    const len = Math.hypot(bx - ax, bz - az);
    const strip = new THREE.BoxGeometry(len + 0.05, 0.035, 0.06);
    strip.rotateY(-Math.atan2(bz - az, bx - ax));
    strip.translate((ax + bx) / 2, 0.02, (az + bz) / 2);
    rimParts.push(strip);
  }
  group.add(new THREE.Mesh(mergeGeometries(rimParts), neon(rim, rimGlow)));

  // Slit lights on the +x and +z faces (the ones the camera sees).
  if (slits) {
    const parts = [];
    const y = -h * 0.42;
    const spacing = 1.25;
    for (const side of ['x', 'z']) {
      const span = (side === 'x' ? d : w) - 2 * chamfer - 0.6;
      const n = Math.max(1, Math.floor(span / spacing));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const g = new THREE.BoxGeometry(0.34, 0.05, 0.03);
        if (side === 'x') {
          g.rotateY(Math.PI / 2);
          g.translate(w / 2 + bevel + 0.005, y, t * span);
        } else {
          g.translate(t * span, y, d / 2 + bevel + 0.005);
        }
        parts.push(g);
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(parts), neon(slits, 2.2)));
  }
  return group;
}

/** Polyline path with rounded corners, for pipes and cables. */
export function roundedPath(points, bend = 0.45) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const path = new THREE.CurvePath();
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const next = pts[i + 1];
    if (!next) {
      path.add(new THREE.LineCurve3(prev, p));
      break;
    }
    const r = Math.min(bend, p.distanceTo(prev) / 2, p.distanceTo(next) / 2);
    const a = p.clone().sub(prev).normalize();
    const b = next.clone().sub(p).normalize();
    const p1 = p.clone().addScaledVector(a, -r);
    const p2 = p.clone().addScaledVector(b, r);
    if (p1.distanceTo(prev) > 1e-4) path.add(new THREE.LineCurve3(prev, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, p, p2));
    prev = p2;
  }
  return { path, pts };
}

/** Metal pipe along points, with flanges at both ends. Returns geometries to merge. */
export function pipeGeometries(points, radius = 0.12, { bend = 0.45, flanges = true } = {}) {
  const { path, pts } = roundedPath(points, bend);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
  const segments = Math.max(8, Math.round(length * 4 + pts.length * 6));
  const geos = [new THREE.TubeGeometry(path, segments, radius, 10, false)];
  if (flanges) {
    for (const [p, q] of [[pts[0], pts[1]], [pts.at(-1), pts.at(-2)]]) {
      const flange = new THREE.CylinderGeometry(radius * 1.45, radius * 1.45, radius * 0.9, 12);
      const dir = q.clone().sub(p).normalize();
      flange.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      flange.translate(p.x + dir.x * radius * 0.5, p.y + dir.y * radius * 0.5, p.z + dir.z * radius * 0.5);
      geos.push(flange);
    }
  }
  return geos;
}

/** Merge many geometries into one mesh (one draw call). */
export function merged(geos, material) {
  const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
  const mesh = new THREE.Mesh(mergeGeometries(mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos), material);
  for (const g of geos) g.dispose();
  return mesh;
}

/** Additive glow sprite (fake light halo; also visible with bloom off). */
export function glowSprite(color, size, opacity = 0.6) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** Ring lying flat (XZ plane), as a thin torus. */
export function flatRing(radius, tube, material, arc = TAU) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, Math.max(24, Math.round(radius * 40)), arc), material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
