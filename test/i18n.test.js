import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, keysOf, makeTranslator } from '../web/i18n.js';
import { logEntry, activityParts, formatDuration } from '../web/narrate.js';
import { STATIONS, activeStations } from '../web/stations.js';

const text = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.v)).join('');

test('every language has exactly the same keys', () => {
  const en = keysOf('en').sort();
  for (const lang of LANGS) assert.deepEqual(keysOf(lang).sort(), en, lang);
});

test('placeholders and optional groups', () => {
  const t = makeTranslator('tr');
  assert.equal(t('log.read', { target: 'auth.js' }), 'auth.js okunuyor...');
  assert.equal(t('log.read', {}), 'okunuyor...');
  assert.equal(t('act.edit', { target: 'auth.js' }), 'Düzenliyor (auth.js)');
  assert.equal(t('act.edit'), 'Düzenliyor');
  assert.deepEqual(t.parts('log.read', { target: 'a.js' }), [{ v: 'a.js' }, ' okunuyor...']);
  assert.equal(t.word('effort', 'high'), 'yüksek');
  assert.equal(t.word('error', 'something_new'), 'something_new');
  assert.equal(t.word('error', undefined), undefined);
  assert.equal(makeTranslator('xx').lang, 'en');
});

test('every hook event gets a sensible log line in both languages', () => {
  const events = [
    { event: 'SessionStart', source: 'startup' },
    { event: 'UserPromptSubmit' },
    { event: 'PreToolUse', tool: 'Read', kind: 'read', target: 'auth.js' },
    { event: 'PreToolUse', tool: 'Grep', kind: 'search', target: 'TODO' },
    { event: 'PreToolUse', tool: 'Edit', kind: 'edit', target: 'auth.js' },
    { event: 'PreToolUse', tool: 'Write', kind: 'edit', target: 'new.js' },
    { event: 'PreToolUse', tool: 'Bash', kind: 'shell', target: 'npm test' },
    { event: 'PreToolUse', tool: 'WebFetch', kind: 'web', target: 'code.claude.com' },
    { event: 'PreToolUse', tool: 'WebSearch', kind: 'web', target: 'three.js bloom' },
    { event: 'PreToolUse', tool: 'TodoWrite', kind: 'task' },
    { event: 'PreToolUse', tool: 'Agent', kind: 'agent', target: 'explore' },
    { event: 'PreToolUse', tool: 'mcp__github__get_issue', kind: 'mcp', target: 'github / get_issue' },
    { event: 'PostToolUseFailure', tool: 'Bash', error: 'Exit code 1' },
    { event: 'PostToolUseFailure', tool: 'Bash', interrupted: true },
    { event: 'PermissionRequest', tool: 'Bash', target: 'rm -rf x' },
    { event: 'SubagentStart', agentType: 'Explore' },
    { event: 'SubagentStop', agentType: 'Explore' },
    { event: 'PreCompact', trigger: 'auto' },
    { event: 'PostCompact', trigger: 'auto' },
    { event: 'Stop' },
    { event: 'StopFailure', error: 'rate_limit' },
    { event: 'SessionEnd', reason: 'clear' },
  ];
  for (const lang of LANGS) {
    const t = makeTranslator(lang);
    for (const e of events) {
      const entry = logEntry(e, t);
      assert.ok(entry, `${lang} ${e.event}`);
      const line = text(entry.parts);
      assert.ok(line.length > 3 && !/[{}[\]]/.test(line) && !line.includes('undefined'), `${lang}: ${line}`);
    }
    assert.equal(logEntry({ event: 'PostToolUse', tool: 'Read' }, t), null);
  }
  const en = makeTranslator('en');
  assert.equal(text(logEntry(events[7], en).parts), 'Fetching code.claude.com...');
  assert.equal(text(logEntry(events[20], makeTranslator('tr')).parts), 'Tur hatayla bitti: hız sınırı');
});

test('character activity text follows the session state', () => {
  const t = makeTranslator('en');
  const base = { status: 'working', activity: null, activeKinds: [], helpers: [], compacting: null };
  assert.equal(text(activityParts(null, t)), 'Waiting for events');
  assert.equal(text(activityParts(base, t)), 'Thinking…');
  assert.equal(text(activityParts({ ...base, status: 'idle' }, t)), 'Idle');
  assert.equal(text(activityParts({ ...base, activity: { kind: 'edit', tool: 'Edit', target: 'auth.js' } }, t)), 'Editing (auth.js)');
  assert.equal(text(activityParts({ ...base, activity: { kind: 'mcp', tool: 'mcp__x__y' } }, t)), 'Using mcp__x__y');
  assert.equal(text(activityParts({ ...base, status: 'waiting', permission: { tool: 'Bash' } }, t)), 'Waiting for permission (Bash)');
  assert.equal(text(activityParts({ ...base, status: 'error', error: { error: 'rate_limit' } }, t)), 'Error (rate limit)');
});

test('durations', () => {
  const t = makeTranslator('tr');
  assert.equal(formatDuration(45_000, t), '45sn');
  assert.equal(formatDuration(75_000, t), '1dk 15sn');
  assert.equal(formatDuration((2 * 3600 + 5 * 60) * 1000, t), '2sa 05dk');
  assert.equal(formatDuration(-5, t), '0sn');
});

test('active stations', () => {
  const base = { status: 'working', activeKinds: [], helpers: [], compacting: null };
  assert.deepEqual([...activeStations({ ...base, activeKinds: ['edit', 'read'] })].sort(), ['board', 'editor']);
  assert.deepEqual([...activeStations({ ...base, activeKinds: ['mcp'] })], ['desk']);
  assert.deepEqual([...activeStations({ ...base, status: 'idle', turnEnded: true })], ['arcade']);
  assert.deepEqual([...activeStations({ ...base, status: 'idle', turnEnded: false })], []); // fresh session
  assert.deepEqual([...activeStations({ ...base, helpers: [{ id: 'a1', agentType: 'Explore', kind: null }] })], ['portal']);
  assert.deepEqual([...activeStations({ ...base, status: 'ended', activeKinds: ['read'] })], []);
  assert.equal(activeStations(null).size, 0);
});

test('station labels: valid modes, fallback slots, names in every language', () => {
  for (const station of STATIONS) {
    assert.ok(['always', 'active', 'never'].includes(station.label), station.key);
    // Labels that are always shown need a fixed slot for when the 3D scene is unavailable.
    if (station.label === 'always') assert.equal(station.slot?.length, 2, station.key);
    for (const lang of LANGS) assert.ok(keysOf(lang).includes(`station.${station.key}`), `${lang} ${station.key}`);
  }
});
