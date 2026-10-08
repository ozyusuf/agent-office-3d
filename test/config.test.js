import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, parseConfig, loadConfig } from '../server/config.js';
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
  const quality = parseConfig({ bloom: false, pixelRatioCap: 1 }, {}).config;
  assert.equal(quality.bloom, false);
  assert.equal(quality.pixelRatioCap, 1);
});

test('invalid values fall back with a warning', () => {
  const { config, warnings } = parseConfig({ language: 'de', port: 80, contextBarMax: 'x', extra: 1, bloom: 'no', pixelRatioCap: 9 }, {});
  assert.equal(config.language, DEFAULTS.language);
  assert.equal(config.bloom, true);
  assert.equal(config.pixelRatioCap, 1.5);
  assert.equal(config.port, DEFAULTS.port);
  assert.equal(config.contextBarMax, DEFAULTS.contextBarMax);
  assert.equal(warnings.length, 6);
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
