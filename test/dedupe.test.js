import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deduper } from '../server/dedupe.js';

const body = (o) => Buffer.from(JSON.stringify(o));
const stop = body({ hook_event_name: 'Stop', session_id: 's1' });

test('the second copy of one event is dropped', () => {
  const d = new Deduper();
  assert.equal(d.isCopy(stop, 1000, 5000), false);
  assert.equal(d.isCopy(stop, 1003, 5600), true); // same body, fired 3 ms apart, arrived later
  assert.equal(d.dropped, 1);
});

test('different events are kept', () => {
  const d = new Deduper();
  assert.equal(d.isCopy(body({ hook_event_name: 'PreToolUse', tool_use_id: 'a' }), 1000, 5000), false);
  assert.equal(d.isCopy(body({ hook_event_name: 'PreToolUse', tool_use_id: 'b' }), 1001, 5001), false);
  assert.equal(d.dropped, 0);
});

test('the same body fired again later is a new event', () => {
  const d = new Deduper();
  assert.equal(d.isCopy(stop, 1000, 5000), false);
  assert.equal(d.isCopy(stop, 9000, 13000), false); // a later turn ended with the same message
  assert.equal(d.isCopy(stop, 9100, 13050), true);
});

test('without fire times the arrival times decide', () => {
  const d = new Deduper();
  assert.equal(d.isCopy(stop, NaN, 5000), false);
  assert.equal(d.isCopy(stop, NaN, 6500), true);
  assert.equal(d.isCopy(stop, NaN, 9000), false);
});

test('old entries are forgotten', () => {
  const d = new Deduper();
  for (let i = 0; i < 50; i++) d.isCopy(body({ i }), i, i);
  d.isCopy(stop, 60000, 60000);
  assert.equal(d.seen.size, 1);
});
