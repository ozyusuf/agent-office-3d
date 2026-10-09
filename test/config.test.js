import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, EDITABLE, parseConfig, loadConfig, checkUpdate, saveConfig } from '../server/config.js';
import { loadStats, createStatsWriter } from '../server/stats.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-test-'));

test('no config file -> defaults', () => {
  const { config, warnings } = loadConfig(path.join(tmp, 'missing.json'), {});
  assert.deepEqual(config, DEFAULTS);
  assert.deepEqual(warnings, []);
});

test('valid values are used, strings trimmed', () => {
  const { config, warnings } = parseConfig({ language: 'tr', agentName: '  Claude ', realmTitle: 'Çalışma Odası İşığı', port: 8000 }, {});
  assert.equal(config.language, 'tr');
  assert.equal(config.agentName, 'Claude');
  assert.equal(config.realmTitle, 'Çalışma Odası İşığı');
  assert.equal(config.port, 8000);
  assert.deepEqual(warnings, []);
  const quality = parseConfig({ bloom: false, pixelRatioCap: 1, maxFps: 30 }, {}).config;
  assert.equal(quality.bloom, false);
  assert.equal(quality.pixelRatioCap, 1);
  assert.equal(quality.maxFps, 30);
});

test('invalid values fall back with a warning', () => {
  const { config, warnings } = parseConfig({ language: 'de', port: 80, contextBarMax: 'x', extra: 1, bloom: 'no', pixelRatioCap: 9, maxFps: 45 }, {});
  assert.equal(config.language, DEFAULTS.language);
  assert.equal(config.maxFps, 60);
  assert.equal(config.bloom, true);
  assert.equal(config.pixelRatioCap, 1.5);
  assert.equal(config.port, DEFAULTS.port);
  assert.equal(config.contextBarMax, DEFAULTS.contextBarMax);
  assert.equal(warnings.length, 7);
});

test('env AGENT_OFFICE_PORT overrides config port', () => {
  assert.equal(parseConfig({ port: 8000 }, { AGENT_OFFICE_PORT: '9001' }).config.port, 9001);
  const bad = parseConfig({ port: 8000 }, { AGENT_OFFICE_PORT: 'abc' });
  assert.equal(bad.config.port, 8000);
  assert.equal(bad.warnings.length, 1);
});

test('broken JSON or BOM', () => {
  const broken = path.join(tmp, 'broken.json');
  fs.writeFileSync(broken, '{ "language": ');
  const r = loadConfig(broken, {});
  assert.deepEqual(r.config, DEFAULTS);
  assert.equal(r.warnings.length, 1);
  const bom = path.join(tmp, 'bom.json');
  fs.writeFileSync(bom, '﻿{"language":"tr"}');
  assert.equal(loadConfig(bom, {}).config.language, 'tr');
});

test('accent colour: #rrggbb, stored in lower case', () => {
  assert.equal(parseConfig({ accentColor: ' #E350A4 ' }, {}).config.accentColor, '#e350a4');
  for (const bad of ['red', '#fff', '#12345g', 123, '']) {
    const r = parseConfig({ accentColor: bad }, {});
    assert.equal(r.config.accentColor, DEFAULTS.accentColor, String(bad));
    assert.equal(r.warnings.length, 1);
  }
});

test('settings panel update: every key except the port, all or nothing', () => {
  assert.ok(!EDITABLE.includes('port'));
  assert.deepEqual(EDITABLE.toSorted(), Object.keys(DEFAULTS).filter((k) => k !== 'port').sort());
  const ok = checkUpdate({ agentName: '  Şimşek ', accentColor: '#AABBCC', bloom: false, contextBarMax: 200, language: 'tr' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.values, { agentName: 'Şimşek', accentColor: '#aabbcc', bloom: false, contextBarMax: 200, language: 'tr' });
  assert.deepEqual(checkUpdate({ realmTitle: '' }).values, { realmTitle: '' }); // empty = default title
  const refused = (patch) => checkUpdate(patch).errors.map((e) => e.key);
  assert.deepEqual(refused({ port: 8000 }), ['port']);
  assert.deepEqual(refused({ agentName: 'x', nope: 1 }), ['nope']);
  assert.deepEqual(refused({ contextBarMax: 5, sessionBarMinutes: 30.5, pixelRatioCap: '2' }), ['contextBarMax', 'sessionBarMinutes', 'pixelRatioCap']);
  assert.deepEqual(refused({ agentName: 'x'.repeat(41) }), ['agentName']);
  for (const bad of [null, [], 'text', {}]) assert.equal(checkUpdate(bad).errors.length, 1);
});

test('saveConfig keeps the other keys of config.json and survives a reload', () => {
  const file = path.join(tmp, 'save.json');
  fs.writeFileSync(file, '﻿{ "port": 8123, "language": "en", "agentName": "Old" }');
  const r = saveConfig(file, { agentName: 'Şimşek', accentColor: '#e350a4' }, {});
  assert.equal(r.config.agentName, 'Şimşek');
  assert.equal(r.config.port, 8123);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(onDisk, { port: 8123, language: 'en', agentName: 'Şimşek', accentColor: '#e350a4' });
  assert.deepEqual(loadConfig(file, {}).config, r.config); // what a restarted server reads
  assert.ok(!fs.existsSync(`${file}.tmp`));
  // env port is never written into the file
  saveConfig(file, { bloom: false }, { AGENT_OFFICE_PORT: '9001' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).port, 8123);
});

test('saveConfig creates a missing file and moves a broken one aside', () => {
  const fresh = path.join(tmp, 'fresh', 'config.json');
  fs.mkdirSync(path.dirname(fresh));
  saveConfig(fresh, { language: 'tr' }, {});
  assert.deepEqual(JSON.parse(fs.readFileSync(fresh, 'utf8')), { language: 'tr' });
  const broken = path.join(tmp, 'fresh', 'broken.json');
  fs.writeFileSync(broken, '{ "language": ');
  const r = saveConfig(broken, { language: 'tr' }, {});
  assert.match(r.warnings[0], /moved/);
  assert.ok(fs.readdirSync(path.dirname(broken)).some((f) => f.startsWith('broken.json.unreadable-')));
  assert.equal(loadConfig(broken, {}).config.language, 'tr');
});

test('stats file: missing -> 0, save + flush -> reload', () => {
  const file = path.join(tmp, 'data', 'stats.json');
  assert.equal(loadStats(file).xp, 0);
  const writer = createStatsWriter(file, 10_000);
  writer.save(41);
  writer.save(42);
  writer.flush();
  assert.equal(loadStats(file).xp, 42);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 1);
});

test('unreadable stats file is kept aside, not overwritten', () => {
  const file = path.join(tmp, 'bad-stats.json');
  fs.writeFileSync(file, 'not json');
  const r = loadStats(file);
  assert.equal(r.xp, 0);
  assert.match(r.warning, /unreadable/);
  assert.ok(fs.readdirSync(tmp).some((f) => f.startsWith('bad-stats.json.unreadable-')));
});
