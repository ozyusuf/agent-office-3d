import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, RING_R, FRAMES, planPath, pathLength, floorAt, spotPoint } from '../web/scene/walk.js';
import { roams, animFor, nextStand, dwell, pickFidget, fidgetGap, envelope, GESTURE_S } from '../web/scene/life.js';
import { createDirector, eventRate, fallsSpeed, rackTarget, powerOf, alertOf, paceOf, frameGap, PACE_FPS, REST_AFTER_MS, LINGER_MS, HOLD_MS } from '../web/scene/director.js';

// ---- Walking ----

const CONSOLE_R = 1.65; // outer radius of the desk's ring console (props.js)

/** Points along a walk, every ~5 cm. */
function sample(from, points) {
  const out = [];
  let prev = from;
  for (const p of points) {
    const n = Math.max(1, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 0.05));
    for (let i = 1; i <= n; i++) out.push([prev[0] + ((p[0] - prev[0]) * i) / n, prev[1] + ((p[1] - prev[1]) * i) / n]);
    prev = p;
  }
  return out;
}

test('every path ends at its spot and never crosses the desk console', () => {
  const keys = Object.keys(SPOTS);
  for (const a of keys) {
    for (const b of keys) {
      const from = spotPoint(a);
      const path = planPath(from, b);
      if (a !== b) assert.deepEqual(path.at(-1), spotPoint(b), `${a} -> ${b}`);
      for (const [x, z] of sample(from, path)) {
        const r = Math.hypot(x, z);
        if (r >= CONSOLE_R - 0.05) continue;
        // Inside the console ring only on the desk leg, through the opening towards the camera.
        const off = Math.abs(Math.atan2(z, x) - Math.PI / 4);
        assert.ok(r < 0.6 || off < 0.3, `${a} -> ${b} walks through the console at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
  }
});

test('arcs go round the front of the desk, never behind it', () => {
  for (const [a, b] of [['board', 'arcade'], ['arcade', 'board'], ['board', 'editor'], ['editor', 'board']]) {
    for (const [x, z] of planPath(spotPoint(a), b)) {
      if (Math.abs(Math.hypot(x, z) - RING_R) > 1e-6) continue;
      assert.ok(x + z > -1.6, `${a} -> ${b}: ring point (${x.toFixed(2)}, ${z.toFixed(2)}) is behind the console`);
    }
  }
});

test('a path from the middle of a walk turns around on the network', () => {
  // On the arcade leg, heading back to the desk: back along the leg, then the ring.
  const from = [-4.0, 1.62];
  const path = planPath(from, 'desk');
  assert.deepEqual(path.at(-1), spotPoint('desk'));
  assert.ok(pathLength(from, path) < 12);
  assert.ok(path[0][0] > from[0], 'first step goes back towards the ring');
  // Already at the spot: nothing left to walk.
  assert.ok(pathLength(spotPoint('editor'), planPath(spotPoint('editor'), 'editor')) < 1e-9);
});

test('floor heights: dais, main platform, step, west platform', () => {
  assert.equal(floorAt(0, 0), 0.2);
  assert.equal(floorAt(3, 3), 0);
  assert.equal(floorAt(-5, 1.8), 0.175);
  assert.equal(floorAt(...spotPoint('arcade')), 0.35);
});

// ---- Stands (where the character moves while it stays at a spot) ----

/** A point in a station's own frame (inverse of walk.js inFrame). */
function toFrame(key, [x, z]) {
  const [fx, fz, turn] = FRAMES[key];
  const dx = x - fx;
  const dz = z - fz;
  return [dx * Math.cos(turn) - dz * Math.sin(turn), dx * Math.sin(turn) + dz * Math.cos(turn)];
}

test('every spot starts at its first stand, at the end of its leg', () => {
  for (const [key, spot] of Object.entries(SPOTS)) {
    assert.ok(spot.stands.length >= 1, key);
    assert.deepEqual(spot.stands[0].at, spotPoint(key), key);
    for (const s of spot.stands) assert.ok(Number.isFinite(s.yaw) && typeof s.act === 'string', key);
  }
});

test('moving between stands never walks into the console, the dais rim, the bench or the board', () => {
  const BODY = 0.5; // about half the character's width
  for (const [key, spot] of Object.entries(SPOTS)) {
    for (const a of spot.stands) {
      for (const b of spot.stands) {
        for (const p of [a.at, ...sample(a.at, [b.at])]) {
          const r = Math.hypot(p[0], p[1]);
          const where = `${key}: (${p[0].toFixed(2)}, ${p[1].toFixed(2)})`;
          // desk: inside the ring console (inner radius 1.2); elsewhere: feet off the dais (r 2.64)
          if (key === 'desk') assert.ok(r <= 1.2 - BODY, where);
          else assert.ok(r >= 2.64 + 0.2, where);
          // on the platforms (main: chamfered 9.6 square)
          if (key !== 'arcade') assert.ok(Math.abs(p[0]) + Math.abs(p[1]) <= 7.8 - BODY && Math.abs(p[0]) <= 4.8 - BODY && Math.abs(p[1]) <= 4.8 - BODY, where);
          // in front of the editor's bench (front edge at local z 0.4) and the board's base
          if (key === 'editor') assert.ok(toFrame('editor', p)[1] >= 0.4 + BODY - 0.05, where);
          if (key === 'board') assert.ok(toFrame('board', p)[1] >= 1.5, where);
        }
      }
    }
  }
});

test('stand choice: away from the main stand and back, never the same one twice', () => {
  const rand = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  assert.equal(nextStand(1, 0, rand), 0);
  for (let i = 0; i < 300; i++) {
    const count = 2 + (i % 4);
    const from = i % count;
    const to = nextStand(count, from, rand);
    assert.ok(to >= 0 && to < count && to !== from, `${from} -> ${to} of ${count}`);
    assert.ok(dwell('type', to, rand) > 1 && dwell('stand', to, rand) > 1);
  }
});

test('animations and gestures per pose', () => {
  assert.ok(roams('type') && roams('code') && roams('present') && roams('stand'));
  assert.ok(!roams('wave') && !roams('slump') && !roams('play'));
  assert.equal(animFor('type', 'keys'), 'type');
  assert.equal(animFor('type', 'panel'), 'swipe');
  assert.equal(animFor('code', 'duck'), 'duck');
  assert.equal(animFor('present', 'study'), 'study');
  assert.equal(animFor('stand', 'panel'), 'stand');
  assert.equal(animFor('wave', 'keys'), 'wave');
  const rand = () => 0.99;
  for (const anim of ['walk', 'wave', 'slump', 'present', 'swipe', 'duck']) assert.equal(pickFidget(anim, rand), null, anim);
  for (const anim of ['stand', 'type', 'code', 'think', 'study', 'play']) {
    for (const r of [0, 0.5, 0.99]) assert.ok(GESTURE_S[pickFidget(anim, () => r)] > 0, anim);
    assert.ok(fidgetGap(anim, rand) > 2);
  }
  for (const name of ['flinch', 'ready', 'cheer']) assert.ok(GESTURE_S[name] > 0, name);
  assert.equal(envelope(0), 0);
  assert.equal(envelope(1), 0);
  assert.equal(envelope(0.5), 1);
  for (let k = 0; k <= 1; k += 0.05) assert.ok(envelope(k) >= 0 && envelope(k) <= 1);
});

// ---- Director ----

const NOW = 1_000_000;
const focusOf = (extra = {}) => ({
  status: 'working', activity: null, activeKinds: [], helpers: [], compacting: null, turnEnded: false, context: 0, ...extra,
});
const act = (kind, extra = {}) => ({ tool: kind, kind, target: `${kind}-target`, ...extra });

test('character: no session or ended -> hidden at the desk', () => {
  const d = createDirector();
  assert.deepEqual(d.character(null, NOW), { spot: 'desk', pose: 'stand', visible: false });
  assert.equal(d.character(focusOf({ status: 'ended' }), NOW).visible, false);
});

test('character goes to the station of the main agent call', () => {
  const d = createDirector();
  assert.deepEqual(d.character(focusOf({ activity: act('edit') }), NOW), { spot: 'editor', pose: 'code', visible: true });
  assert.equal(d.character(focusOf({ activity: act('read') }), NOW).spot, 'board');
  assert.equal(d.character(focusOf({ activity: act('search') }), NOW).spot, 'board');
  assert.deepEqual(d.character(focusOf({ activity: act('shell') }), NOW), { spot: 'desk', pose: 'type', visible: true });
  assert.equal(d.character(focusOf({ activity: act('web') }), NOW).spot, 'desk');
  assert.equal(d.character(focusOf({ activity: act('mcp') }), NOW).spot, 'desk');
  // A helper's call does not move the character.
  assert.equal(d.character(focusOf({ activity: act('edit', { agentId: 'a1' }) }), NOW).spot, 'desk');
});

test('character lingers at a work station between calls, then returns to the desk', () => {
  const d = createDirector();
  d.character(focusOf({ activity: act('read') }), NOW);
  assert.equal(d.character(focusOf(), NOW + 1000).spot, 'board'); // thinking between two reads
  assert.equal(d.character(focusOf(), NOW + LINGER_MS + 1).spot, 'desk');
  // A desk call ends the linger at once.
  d.character(focusOf({ activity: act('edit') }), NOW);
  d.character(focusOf({ activity: act('shell') }), NOW + 100);
  assert.equal(d.character(focusOf(), NOW + 200).spot, 'desk');
});

test('a call shorter than one frame still moves the character (live events)', () => {
  const d = createDirector();
  d.note({ event: 'PreToolUse', kind: 'edit', tool: 'Edit', target: 'a.js' }, NOW);
  assert.equal(d.character(focusOf(), NOW + 50).spot, 'editor'); // the snapshot already shows no call
  assert.ok(d.stations(focusOf(), NOW + 50).has('editor'));
  assert.ok(!d.stations(focusOf(), NOW + HOLD_MS + 1).has('editor'));
});

test('character: waiting waves, error slumps, idle plays only after a finished turn', () => {
  const d = createDirector();
  assert.deepEqual(d.character(focusOf({ status: 'waiting', activity: act('edit') }), NOW),
    { spot: 'editor', pose: 'wave', visible: true, faceCamera: true });
  assert.equal(d.character(focusOf({ status: 'waiting' }), NOW).spot, 'desk');
  assert.deepEqual(d.character(focusOf({ status: 'error' }), NOW), { spot: 'desk', pose: 'slump', visible: true });
  assert.deepEqual(d.character(focusOf({ status: 'idle', turnEnded: true }), NOW), { spot: 'arcade', pose: 'play', visible: true });
  assert.deepEqual(d.character(focusOf({ status: 'idle' }), NOW), { spot: 'desk', pose: 'stand', visible: true });
  // Stop ends any linger: straight to the arcade.
  d.character(focusOf({ activity: act('read') }), NOW);
  assert.equal(d.character(focusOf({ status: 'idle', turnEnded: true }), NOW + 10).spot, 'arcade');
});

test('stations: holds end, nothing is lit for an ended session', () => {
  const d = createDirector();
  d.note({ event: 'PreToolUse', kind: 'web', tool: 'WebFetch' }, NOW);
  assert.deepEqual([...d.stations(focusOf(), NOW + 10)], ['orbit']);
  assert.equal(d.stations(focusOf({ status: 'ended' }), NOW + 10).size, 0);
  assert.equal(d.stations(focusOf(), NOW + HOLD_MS + 10).size, 0);
});

test('board shows the latest read / search / task call', () => {
  const d = createDirector();
  assert.equal(d.board(focusOf()), null);
  d.note({ event: 'PreToolUse', kind: 'read', target: 'auth.js' }, NOW);
  assert.deepEqual(d.board(focusOf()), { kind: 'read', target: 'auth.js', todos: null });
  d.note({ event: 'PreToolUse', kind: 'shell', target: 'npm test' }, NOW);
  assert.equal(d.board(focusOf()).target, 'auth.js'); // shell calls do not touch the board
  const todos = { total: 3, done: 1, doing: 1 };
  assert.deepEqual(d.board(focusOf({ activity: act('task', { todos }) })).todos, todos);
});

test('derived values: rate, falls, racks, power, alert', () => {
  assert.equal(eventRate([NOW - 70_000, NOW - 30_000, NOW - 1], NOW), 2);
  assert.ok(fallsSpeed(0) < fallsSpeed(10) && fallsSpeed(40) === fallsSpeed(400));
  assert.equal(rackTarget(focusOf({ context: 75 }), 0.5, 144), 72);
  assert.equal(rackTarget(focusOf({ context: 900 }), 6, 144), 144);
  assert.equal(rackTarget(focusOf({ context: 75, compacting: { trigger: 'auto' } }), 0.5, 144), 0);
  assert.equal(rackTarget(null, 0.5, 144), 0);
  assert.equal(powerOf(null), 0);
  assert.equal(powerOf(focusOf({ status: 'ended' })), 0);
  assert.equal(powerOf(focusOf({ status: 'idle' })), 1);
  assert.equal(alertOf(focusOf({ status: 'error' })), 1);
  assert.equal(alertOf(focusOf()), 0);
});

// ---- Frame pacing (D67) ----

test('full rate only while something travels; calm in a session, standby without one or at rest', () => {
  const still = { travelling: false, strolling: false, quietMs: 1000 };
  const rested = { ...still, quietMs: REST_AFTER_MS + 1 };
  assert.equal(paceOf({ status: 'working' }, { ...still, travelling: true }), 'active');
  assert.equal(paceOf(null, { ...rested, travelling: true }), 'active');
  for (const status of ['working', 'waiting', 'idle', 'error']) assert.equal(paceOf({ status }, still), 'calm');
  // A finished turn rests after a quiet minute, unless the character strolls; a long tool call does not.
  assert.equal(paceOf({ status: 'idle' }, rested), 'standby');
  assert.equal(paceOf({ status: 'idle' }, { ...rested, strolling: true }), 'calm');
  for (const status of ['working', 'waiting', 'error']) assert.equal(paceOf({ status }, rested), 'calm');
  assert.equal(paceOf({ status: 'ended' }, still), 'standby');
  assert.equal(paceOf(null, still), 'standby');
  assert.ok(PACE_FPS.active > PACE_FPS.calm && PACE_FPS.calm > PACE_FPS.standby);
});

test('frame gaps: a 60 Hz screen draws every 1st / 2nd / 4th frame despite jitter', () => {
  const vsync = 1000 / 60;
  for (const [fps, every] of [[60, 1], [30, 2], [15, 4]]) {
    const gap = frameGap(fps);
    // A frame that comes 2 ms early is still drawn; the display frame before it is not.
    assert.ok(every * vsync - 2 >= gap, `${fps} fps`);
    assert.ok((every - 1) * vsync + 2 < gap, `${fps} fps`);
  }
  // 144 Hz: at most ~72 fps at the full rate.
  assert.ok(frameGap(60) > 1000 / 144);
});
