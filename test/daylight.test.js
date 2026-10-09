import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, orbitAt, mixHex, hourOf, SUNRISE, SUNSET } from '../web/scene/daylight.js';

test('the sky is continuous over the whole day and wraps at midnight', () => {
  const channels = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  let prev = skyAt(0);
  for (let m = 1; m <= 24 * 60; m++) {
    const sky = skyAt(m / 60);
    for (const key of ['top', 'horizon', 'low', 'lit', 'shade']) {
      const jump = Math.max(...channels(sky[key]).map((v, i) => Math.abs(v - channels(prev[key])[i])));
      assert.ok(jump <= 6, `${key} jumps ${jump} at minute ${m}`);
    }
    for (const key of ['stars', 'sun', 'day', 'warm']) {
      assert.ok(sky[key] >= 0 && sky[key] <= 1, `${key} out of range at minute ${m}`);
      assert.ok(Math.abs(sky[key] - prev[key]) < 0.02, `${key} jumps at minute ${m}`);
    }
    prev = sky;
  }
  assert.deepEqual({ ...skyAt(24), hour: 0, orbit: null }, { ...skyAt(0), hour: 0, orbit: null });
  assert.equal(skyAt(-1).hour, 23);
});

test('night has stars and the moon, noon is bright with the sun', () => {
  const night = skyAt(2);
  const noon = skyAt(12);
  assert.ok(night.stars > 0.9 && night.day < 0.1 && night.sun === 0);
  assert.ok(noon.stars === 0 && noon.day === 1 && noon.sun === 1);
  assert.equal(skyAt(18).warm, 1); // sunset
});

test('sun and moon rise on the left and set on the right', () => {
  assert.deepEqual(orbitAt(SUNRISE), { body: 'sun', x: -1, y: 0 });
  const noon = orbitAt((SUNRISE + SUNSET) / 2);
  assert.equal(noon.body, 'sun');
  assert.ok(Math.abs(noon.x) < 1e-9 && Math.abs(noon.y - 1) < 1e-9);
  assert.equal(orbitAt(SUNSET).body, 'moon');
  assert.ok(Math.abs(orbitAt(SUNSET).x + 1) < 1e-9);
  const late = orbitAt(SUNRISE - 0.01);
  assert.equal(late.body, 'moon');
  assert.ok(late.x > 0.99);
});

test('helpers', () => {
  assert.equal(mixHex(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(mixHex(0x102030, 0x102030, 0.3), 0x102030);
  assert.equal(hourOf(new Date(2026, 9, 9, 18, 30, 0)), 18.5);
});
