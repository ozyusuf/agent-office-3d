import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PALETTE as P, DEFAULT_ACCENT, accentPair } from '../web/palette.js';
import { ACCENT, neon, setGlow, live, trackAccent, setAccent } from '../web/scene/kit.js';

test('accent pair: the default gives the measured cyan pair', () => {
  const pair = accentPair(DEFAULT_ACCENT);
  assert.equal(pair.main, P.neonCyan);
  assert.equal(pair.soft, P.neonCyanSoft);
  assert.deepEqual(pair.css, { main: '#33b7de', soft: '#4fc3e4' });
});

test('accent pair: any other colour gets a lighter soft tone; invalid -> default', () => {
  const pair = accentPair('#E350A4');
  assert.equal(pair.main, 0xe350a4);
  assert.equal(pair.css.soft, '#e76ab2'); // 15 % white mixed in
  assert.deepEqual(accentPair('#000000').css, { main: '#000000', soft: '#262626' });
  for (const bad of [undefined, '', 'red', '#fff']) assert.equal(accentPair(bad).main, P.neonCyan);
});

const close = (a, b) => ['r', 'g', 'b'].every((c) => Math.abs(a[c] - b[c]) < 1e-6);
const times = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

test('the scene recolours everything built in the base cyan, and nothing else', () => {
  const root = new THREE.Group();
  const cyan = new THREE.Mesh(new THREE.BoxGeometry(), neon(P.neonCyan, 2.6, { own: true }));
  const soft = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: times(P.neonCyanSoft, 1.3) }));
  const red = new THREE.Mesh(new THREE.BoxGeometry(), neon(P.alertRed, 2, { own: true }));
  const white = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: times(0xffffff, 1.4) }));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: P.neonCyan }));
  const light = new THREE.PointLight(P.neonCyan, 5);
  const dots = new THREE.BufferGeometry();
  const c1 = times(P.neonCyan, 0.8);
  const c2 = times(P.neonMagenta, 1.2);
  dots.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  dots.setAttribute('color', new THREE.BufferAttribute(new Float32Array([c1.r, c1.g, c1.b, c2.r, c2.g, c2.b]), 3));
  root.add(cyan, soft, red, white, sprite, light, new THREE.Points(dots, new THREE.PointsMaterial({ vertexColors: true })));
  trackAccent(root);

  const pair = accentPair('#56d999');
  setAccent(pair);
  assert.deepEqual(ACCENT, { main: pair.main, soft: pair.soft });
  assert.ok(close(cyan.material.color, times(pair.main, 2.6)));
  assert.ok(close(soft.material.color, times(pair.soft, 1.3)));
  assert.ok(close(sprite.material.color, times(pair.main, 1)));
  assert.ok(close(light.color, times(pair.main, 1)));
  assert.ok(close(red.material.color, times(P.alertRed, 2)), 'red stays red');
  assert.ok(close(white.material.color, times(0xffffff, 1.4)), 'white stays white');
  const attr = dots.attributes.color;
  const v = (i) => ({ r: attr.getX(i), g: attr.getY(i), b: attr.getZ(i) });
  assert.ok(close(v(0), times(pair.main, 0.8)));
  assert.ok(close(v(1), c2), 'magenta dot stays');

  // Glows set every frame with the base cyan follow the accent.
  setGlow(red.material, P.neonCyan, 2);
  assert.ok(close(red.material.color, times(pair.main, 2)));
  assert.equal(live(P.neonMagenta), P.neonMagenta);

  // Built later (a helper bot): takes the current accent when tracked.
  const late = new THREE.Mesh(new THREE.BoxGeometry(), neon(P.neonCyan, 3, { own: true }));
  trackAccent(late);
  assert.ok(close(late.material.color, times(pair.main, 3)));

  // Back to the default: the measured colours return.
  setAccent(accentPair(DEFAULT_ACCENT));
  assert.ok(close(cyan.material.color, times(P.neonCyan, 2.6)));
  assert.ok(close(soft.material.color, times(P.neonCyanSoft, 1.3)));
  assert.ok(close(v(0), c1));
  assert.ok(close(late.material.color, times(P.neonCyan, 3)));
});
