// The sky around the realm (D54): a gradient that follows the viewer's local time, a sea of clouds
// below the islands, the sun by day, the moon and stars by night, fireflies after dark. Decoration
// only: the clock is its only input, nothing here stands for session data. The scene's ambient
// lights follow the same time (apply()).
//
// The camera is orthographic, so there is no real horizon: the sky is a gradient plane that rides
// with the camera, and the cloud field below the islands fades into the gradient's horizon band.
// Clouds, sky and stars all go through the same tone mapping, so the fade has no seam.

import * as THREE from 'three';
import { TAU, rng, TEX } from './kit.js';
import { skyAt, hourOf, mixHex } from './daylight.js';

const SKY_DEPTH = 185; // camera-space distance of the gradient plane (camera far = 200)
const BODY_DEPTH = 150; // stars, sun and moon: behind everything else
const CLOUD_Y = -7.6; // top layer of the cloud sea (the islands' rocks dip into it)
const FIELD = { across: 26, near: -10, far: 44, step: 3.1 }; // cloud field on the ground plane
const FADE = { near: 78, far: 104 }; // view depth over which far clouds melt into the horizon
const UPDATE_MS = 15000;

/**
 * @param {THREE.Scene} scene
 * @param {THREE.OrthographicCamera} camera  must be in the scene (its children are the sky layers)
 * @param {{ hour?: () => number|null, calm?: boolean }} options  hour() returns a fixed hour or null = the
 *   clock; calm = the viewer prefers reduced motion (no drift, twinkle, shooting stars or lightning)
 */
export function buildSky(scene, camera, { hour = () => null, calm = false } = {}) {
  const ticks = [];
  const lit = new THREE.Color();
  const shade = new THREE.Color();
  const baseLit = new THREE.Color(); // the clouds' colours for the time of day, before the storm
  const baseShade = new THREE.Color();
  const horizon = new THREE.Color();
  let sky = skyAt(hour() ?? hourOf(new Date()));
  let horizonY = 0.42; // screen fraction (0 = top) where the cloud sea meets the sky; set by reframe()

  // Ground axes as seen from the camera: across (screen right) and far (up the screen).
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const far = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).setY(0).normalize().negate();

  // ---- Gradient plane (rides with the camera) ----
  const ROWS = 48;
  const skyGeo = new THREE.PlaneGeometry(1, 1, 1, ROWS);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const skyPlane = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
  skyPlane.position.z = -SKY_DEPTH;
  skyPlane.renderOrder = -10;
  skyPlane.frustumCulled = false;
  camera.add(skyPlane);

  function paintGradient() {
    const top = new THREE.Color(sky.top);
    const mid = new THREE.Color(sky.horizon);
    const low = new THREE.Color(sky.low);
    const c = new THREE.Color();
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    const smooth = (x) => x * x * (3 - 2 * x);
    for (let i = 0; i < pos.count; i++) {
      const f = 0.5 - pos.getY(i); // 0 = top of the window, 1 = bottom
      if (f < horizonY) c.lerpColors(top, mid, (f / horizonY) ** 2.2); // the glow hugs the horizon
      else c.lerpColors(mid, low, smooth(Math.min(1, (f - horizonY) / 0.3)));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // ---- Stars, sun and moon (camera space, behind the islands and clouds) ----
  const bodies = new THREE.Group();
  bodies.position.z = -BODY_DEPTH;
  camera.add(bodies);
  const starLayer = new THREE.Group(); // stars in 0..1 above the horizon, scaled by reframe()
  bodies.add(starLayer);
  const stars = [];
  const rand = rng(77);
  for (const [count, size] of [[230, 2.2], [36, 4.2]]) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const base = [];
    for (let i = 0; i < count; i++) {
      p.set([rand() - 0.5, Math.pow(rand(), 0.8), 0], i * 3);
      const tint = rand();
      base.push({
        c: new THREE.Color(tint < 0.15 ? 0xffd9b0 : tint < 0.35 ? 0xbfd4ff : 0xffffff).multiplyScalar(0.35 + rand() * 0.65),
        f: 0.6 + rand() * 2.2,
        ph: rand() * TAU,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, map: TEX.glow, vertexColors: true, transparent: true,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    points.frustumCulled = false;
    starLayer.add(points);
    stars.push({ geo, base });
  }
  let twinkleAt = 0;
  ticks.push((t) => {
    if (t - twinkleAt < 1 / 15) return; // 15 updates a second are plenty for a twinkle
    twinkleAt = t;
    for (const { geo, base } of stars) {
      const col = geo.attributes.color;
      base.forEach((s, i) => {
        const k = sky.stars * (calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.f + s.ph));
        col.setXYZ(i, s.c.r * k, s.c.g * k, s.c.b * k);
      });
      col.needsUpdate = true;
    }
  });

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0x9fb6ee, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xfff4dc, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xffd9a0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  moon.scale.setScalar(1.25);
  moonHalo.scale.setScalar(6.5);
  sun.scale.setScalar(2.6);
  sunHalo.scale.setScalar(13);
  bodies.add(moonHalo, moon, sunHalo, sun);

  // ---- Shooting star: a finished turn (Stop) while stars are out ----
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  streak.visible = false;
  // In front of the far clouds (view depth 78+), still behind the islands.
  streak.position.z = -76;
  camera.add(streak);
  let shot = null;
  let skyClock = 0;
  ticks.push((t, dt) => {
    skyClock += dt;
    if (!shot) return;
    const p = (skyClock - shot.t0) / shot.dur;
    if (p >= 1) {
      shot = null;
      streak.visible = false;
      return;
    }
    const e = 1 - (1 - p) ** 2;
    streak.position.set(shot.x + shot.dx * e, shot.y + shot.dy * e, -76);
    streak.scale.set(shot.len * Math.sin(Math.PI * Math.min(1, p * 1.3)), 0.11, 1);
    streak.material.opacity = Math.sin(Math.PI * p) * shot.k;
  });

  // ---- Storm: an API error (StopFailure) darkens the clouds, rain falls, soft lightning ----
  let storm = 0; // 0..1, eased by realm.js from the alert state
  let flash = 0;
  let nextFlash = 2;
  const RAIN = 420;
  const rainPos = new Float32Array(RAIN * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
    color: 0xc6d6ff, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const r4 = rng(29);
  const drops = Array.from({ length: RAIN }, () => ({
    x: (r4() - 0.5) * 30, y: -9 + r4() * 22, z: (r4() - 0.5) * 30, v: 15 + r4() * 7,
  }));
  const slant = right.clone().multiplyScalar(0.09);
  ticks.push((t, dt) => {
    rain.visible = storm > 0.02;
    flash = Math.max(0, flash - dt / 0.22);
    if (!rain.visible) return;
    rain.material.opacity = 0.55 * storm;
    drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < -9) d.y += 22;
      const len = 0.55;
      rainPos.set([d.x, d.y, d.z, d.x - slant.x * len * 4, d.y + len, d.z - slant.z * len * 4], i * 6);
    });
    rainGeo.attributes.position.needsUpdate = true;
    // Soft lightning now and then (never with reduced motion).
    if (!calm && storm > 0.6) {
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flash = 0.7 + r4() * 0.3;
        nextFlash = 3 + r4() * 5;
      }
    }
  });

  // ---- Sea of clouds: soft cumulus puffs on a field below the islands ----
  const field = [];
  const r2 = rng(19);
  for (let v = FIELD.near; v <= FIELD.far; v += FIELD.step) {
    for (let u = -FIELD.across; u <= FIELD.across; u += FIELD.step * 1.15) {
      if (r2() < 0.12) continue;
      const lower = r2() < 0.28; // a second, deeper layer gives depth between the puffs
      field.push({
        u: u + (r2() - 0.5) * FIELD.step,
        v: v + (r2() - 0.5) * FIELD.step,
        y: (lower ? CLOUD_Y - 2.6 : CLOUD_Y) + (r2() - 0.5) * 1.1,
        size: (lower ? 5.5 : 3.6) + r2() * 3.4,
        tone: lower ? 0.72 : 0.9 + r2() * 0.1,
        bob: r2() * TAU,
      });
    }
  }
  const puffMat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: false });
  const uniforms = {
    uLit: { value: lit }, uShade: { value: shade }, uHorizon: { value: horizon },
    uFadeNear: { value: FADE.near }, uFadeFar: { value: FADE.far },
  };
  puffMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying float vSkyDepth;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>', '#include <project_vertex>\n  vSkyDepth = -mvPosition.z;');
    shader.fragmentShader = `uniform vec3 uLit;\nuniform vec3 uShade;\nuniform vec3 uHorizon;\nuniform float uFadeNear;\nuniform float uFadeFar;\nvarying float vSkyDepth;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 puff = texture2D( map, vMapUv );
  diffuseColor.rgb *= mix( uShade, uLit, puff.r );
  diffuseColor.a *= puff.a;
#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float skyFade = smoothstep( uFadeNear, uFadeFar, vSkyDepth );
  diffuseColor.rgb = mix( diffuseColor.rgb, uHorizon, skyFade );
  diffuseColor.a *= 1.0 - 0.5 * skyFade * skyFade;`);
  };
  const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.62), puffMat, field.length);
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  clouds.frustumCulled = false;
  clouds.renderOrder = -5;
  // Far puffs first, so the near ones are drawn over them.
  field.sort((a, b) => b.v - a.v);
  field.forEach((p, i) => clouds.setColorAt(i, new THREE.Color().setScalar(p.tone)));
  scene.add(clouds);
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const facing = camera.quaternion.clone();
  const span = FIELD.across * 2 + FIELD.step;
  ticks.push((t, dt) => {
    field.forEach((p, i) => {
      if (!calm) p.u += dt * (0.12 + 0.5 * storm) * (p.y < CLOUD_Y - 1 ? 0.6 : 1); // wind to the right; the deep layer is slower
      if (p.u > FIELD.across + FIELD.step / 2) p.u -= span;
      at.copy(right).multiplyScalar(p.u).addScaledVector(far, p.v);
      at.y = p.y + (calm ? 0 : Math.sin(t * 0.25 + p.bob) * 0.12);
      m.compose(at, facing, scl.set(p.size, p.size, 1));
      clouds.setMatrixAt(i, m);
    });
    clouds.instanceMatrix.needsUpdate = true;
    // Storm: darker clouds and sky, lit up for a moment by lightning.
    const dark = 1 - 0.55 * storm + 0.9 * flash * storm;
    lit.copy(baseLit).multiplyScalar(dark);
    shade.copy(baseShade).multiplyScalar(1 - 0.45 * storm + 0.6 * flash * storm);
    skyPlane.material.color.setScalar(1 - 0.5 * storm + 1.2 * flash * storm);
  });

  // ---- Fireflies around the islands after dark ----
  const FLIES = 64;
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(FLIES * 3);
  const flyCol = new Float32Array(FLIES * 3);
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
  const r3 = rng(23);
  const flies = Array.from({ length: FLIES }, () => ({
    x: (r3() - 0.5) * 24, y: -2.5 + r3() * 8, z: (r3() - 0.5) * 24,
    a: 0.2 + r3() * 0.4, b: 0.15 + r3() * 0.3, ph: r3() * TAU, blink: 0.5 + r3() * 1.4,
    warm: r3() < 0.75,
  }));
  const flyPoints = new THREE.Points(flyGeo, new THREE.PointsMaterial({
    size: 5, sizeAttenuation: false, map: TEX.glow, vertexColors: true, transparent: true,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  flyPoints.frustumCulled = false;
  scene.add(flyPoints);
  const warmFly = new THREE.Color(0xffc870);
  const coolFly = new THREE.Color(0x9ff0d8);
  ticks.push((t) => {
    const night = Math.max(0, 1 - sky.day * 1.6);
    flyPoints.visible = night > 0.01;
    if (!flyPoints.visible) return;
    flies.forEach((f, i) => {
      flyPos[i * 3] = f.x + Math.sin(t * f.a + f.ph) * 1.4;
      flyPos[i * 3 + 1] = f.y + Math.sin(t * f.b * 1.7 + f.ph * 2) * 0.6;
      flyPos[i * 3 + 2] = f.z + Math.cos(t * f.b + f.ph) * 1.4;
      const k = night * Math.max(0, Math.sin(t * f.blink + f.ph)) ** 3;
      const c = f.warm ? warmFly : coolFly;
      flyCol[i * 3] = c.r * k;
      flyCol[i * 3 + 1] = c.g * k;
      flyCol[i * 3 + 2] = c.b * k;
    });
    flyGeo.attributes.position.needsUpdate = true;
    flyGeo.attributes.color.needsUpdate = true;
  });

  // ---- Time of day ----
  let size = { w: 1, h: 1 };
  const bodyLight = { moon: 0, moonHalo: 0, sun: 0, sunHalo: 0 }; // before the storm hides them
  ticks.push(() => {
    const hidden = 1 - 0.8 * storm;
    moon.material.opacity = bodyLight.moon * hidden;
    moonHalo.material.opacity = bodyLight.moonHalo * hidden;
    sun.material.opacity = bodyLight.sun * hidden;
    sunHalo.material.opacity = bodyLight.sunHalo * hidden;
  });
  function placeBodies() {
    const { orbit } = sky;
    const x = orbit.x * size.w * 0.4;
    const y = size.h * (0.5 - horizonY) + orbit.y * size.h * (horizonY - 0.17) - 0.4;
    for (const s of [moon, moonHalo, sun, sunHalo]) s.position.set(x, y, 0);
    const isSun = orbit.body === 'sun';
    bodyLight.moon = isSun ? 0 : (1 - sky.sun) * 0.95;
    bodyLight.moonHalo = isSun ? 0 : (1 - sky.sun) * 0.28;
    bodyLight.sun = isSun ? Math.min(1, sky.sun) : 0;
    bodyLight.sunHalo = isSun ? 0.32 + 0.18 * sky.warm : 0;
    sunHalo.material.color.setHex(mixHex(0xfff0c8, 0xff9a5a, sky.warm));
  }

  function update() {
    sky = skyAt(hour() ?? hourOf(new Date()));
    // Daylight clouds stay under the bloom threshold, or the glow would wash the whole view white.
    baseLit.setHex(sky.lit).multiplyScalar(1.12 - 0.36 * sky.day);
    baseShade.setHex(sky.shade).multiplyScalar(1 - 0.2 * sky.day);
    lit.copy(baseLit);
    shade.copy(baseShade);
    horizon.setHex(sky.horizon);
    paintGradient();
    placeBodies();
    scene.fog.color.setHex(mixHex(sky.low, sky.shade, 0.45));
    listeners.forEach((fn) => fn(sky));
  }
  const listeners = [];
  scene.fog = new THREE.Fog(0x000000, 0, 1); // range is set by the camera (realm.js)
  let lastUpdate = 0;
  ticks.push(() => {
    const now = performance.now();
    if (now - lastUpdate > UPDATE_MS) {
      lastUpdate = now;
      update();
    }
  });

  return {
    ticks,
    get sky() { return sky; },
    /** fn(sky) after every change of the time of day. */
    onChange(fn) { listeners.push(fn); },
    /** Size the camera layers to the view and find where the cloud field meets the sky. */
    reframe() {
      size = { w: camera.right - camera.left, h: camera.top - camera.bottom };
      skyPlane.scale.set(size.w * 1.05, size.h * 1.05, 1);
      camera.updateMatrixWorld();
      // The far edge of the cloud field, projected: the horizon of this realm.
      const edge = far.clone().multiplyScalar(FIELD.far - FIELD.step).setY(CLOUD_Y + 1.5).project(camera);
      horizonY = Math.min(0.55, Math.max(0.12, (1 - edge.y) / 2));
      starLayer.position.set(0, size.h * (0.5 - horizonY), 0);
      starLayer.scale.set(size.w * 1.05, size.h * horizonY, 1);
      update();
    },
    update,
    /** 0..1: an API error is going on (eased by realm.js). */
    setStorm(value) {
      storm = value;
    },
    /** Lightning brightness right now (realm.js lifts the exposure with it). */
    flash: () => flash * storm,
    /** A shooting star across the upper sky (only when stars are out). */
    shootingStar() {
      if (calm || sky.stars < 0.25 || shot) return false;
      const x = (-0.46 + rand() * 0.28) * size.w;
      // The open sky in a portrait window is the band under the HUD's header, above the islands.
      const y = size.h * (0.5 - (0.125 + rand() * 0.03));
      const dx = size.w * (0.36 + rand() * 0.16);
      const dy = -size.h * (0.015 + rand() * 0.02);
      shot = { t0: skyClock, dur: 1.6, x, y, dx, dy, len: 3.4, k: Math.min(1, sky.stars * 1.2) };
      streak.rotation.z = Math.atan2(dy, dx);
      streak.visible = true;
      return true;
    },
  };
}

/** A streak of light: bright head on the right, fading tail. */
function streakTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.85, 'rgba(220,235,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  const v = g.createLinearGradient(0, 0, 0, 16);
  g.fillRect(0, 5, 256, 6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.5, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Moon: a pale disc with soft maria. */
function moonTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d');
  const r = s / 2 - 4;
  const grad = g.createRadialGradient(s * 0.42, s * 0.4, r * 0.1, s / 2, s / 2, r);
  grad.addColorStop(0, '#fbfbf4');
  grad.addColorStop(0.8, '#e6e8ee');
  grad.addColorStop(1, '#c9cfdc');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(s / 2, s / 2, r, 0, TAU);
  g.fill();
  const rand = rng(5);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9; i++) {
    const x = s * (0.3 + rand() * 0.45);
    const y = s * (0.28 + rand() * 0.45);
    const rr = 5 + rand() * 14;
    const m = g.createRadialGradient(x, y, 0, x, y, rr);
    m.addColorStop(0, 'rgba(150,158,178,0.45)');
    m.addColorStop(1, 'rgba(150,158,178,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cumulus puff: alpha = shape, red = how much sunlight that part gets (lit top, shaded base). */
function puffTexture() {
  const W = 256;
  const H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const blobs = [
    [0.5, 0.52, 0.3], [0.3, 0.64, 0.2], [0.7, 0.62, 0.22], [0.4, 0.4, 0.2], [0.6, 0.38, 0.18],
    [0.18, 0.74, 0.13], [0.84, 0.74, 0.13], [0.5, 0.7, 0.26],
  ];
  for (const [x, y, r] of blobs) {
    const cx = x * W;
    const cy = y * H;
    const rr = r * W;
    const grad = g.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  // Light from above: the top is lit, the base sits in shade.
  g.globalCompositeOperation = 'source-atop';
  const light = g.createLinearGradient(0, H * 0.15, 0, H * 0.9);
  light.addColorStop(0, 'rgb(255,255,255)');
  light.addColorStop(0.55, 'rgb(190,190,190)');
  light.addColorStop(1, 'rgb(40,40,40)');
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  // A flat, soft base.
  g.globalCompositeOperation = 'destination-in';
  const base = g.createLinearGradient(0, H * 0.72, 0, H * 0.95);
  base.addColorStop(0, 'rgba(0,0,0,1)');
  base.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // data: red = sunlight amount
  return tex;
}
