import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HOOK_EVENTS, hookHandler, addHooks, removeHooks, otherCopies, detectStyle, formatSettings, lineDiff,
} from '../scripts/hooks-config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = 'C:\\Users\\me\\agent-office-3d\\hooks\\send-event.ps1';
const userHook = { type: 'command', command: 'node', args: ['C:\\tools\\lint.js'] };
const userSettings = () => ({
  model: 'opus',
  permissions: { allow: ['Bash(npm test)'] },
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [userHook] }] },
});

test('HOOK_EVENTS matches the events in the project settings', () => {
  const project = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual([...HOOK_EVENTS].sort(), Object.keys(project.hooks).sort());
  // Same handler as the project one, only with an absolute path.
  const projectHandler = project.hooks.Stop[0].hooks[0];
  const ours = hookHandler('${CLAUDE_PROJECT_DIR}/hooks/send-event.ps1');
  assert.deepEqual(ours, projectHandler);
});

test('install adds one async handler per event and keeps everything else', () => {
  const { settings, added, kept, stale } = addHooks(userSettings(), SCRIPT);
  assert.equal(added, 13);
  assert.equal(kept, 0);
  assert.equal(stale, 0);
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)'] });
  assert.deepEqual(settings.hooks.PreToolUse[0], { matcher: 'Bash', hooks: [userHook] });
  for (const event of HOOK_EVENTS) {
    const groups = settings.hooks[event];
    const last = groups[groups.length - 1];
    assert.deepEqual(last, { hooks: [hookHandler(SCRIPT)] });
    assert.equal(last.matcher, undefined); // every tool
  }
});

test('install does not change its input and is idempotent', () => {
  const input = userSettings();
  const copy = structuredClone(input);
  const once = addHooks(input, SCRIPT).settings;
  assert.deepEqual(input, copy);
  const twice = addHooks(once, SCRIPT);
  assert.equal(twice.added, 0);
  assert.equal(twice.kept, 13);
  assert.deepEqual(twice.settings, once);
});

test('install into an empty file', () => {
  const { settings, added } = addHooks({}, SCRIPT);
  assert.equal(added, 13);
  assert.deepEqual(Object.keys(settings), ['hooks']);
  assert.deepEqual(Object.keys(settings.hooks), HOOK_EVENTS);
});

test('a changed handler of ours is replaced, not doubled', () => {
  const installed = addHooks({}, SCRIPT).settings;
  installed.hooks.Stop[0].hooks[0].async = false; // edited by hand
  const { settings, added, kept } = addHooks(installed, SCRIPT);
  assert.equal(added, 1);
  assert.equal(kept, 12);
  assert.equal(settings.hooks.Stop.length, 1);
  assert.equal(settings.hooks.Stop[0].hooks[0].async, true);
});

test('a hook from a clone that no longer exists is replaced; a living one is kept and reported', () => {
  const old = 'D:\\old\\agent-office-3d\\hooks\\send-event.ps1';
  const other = 'E:\\second\\agent-office-3d\\hooks\\send-event.ps1';
  const start = { hooks: { Stop: [{ hooks: [hookHandler(old)] }, { hooks: [hookHandler(other)] }] } };
  const exists = (p) => p !== old;
  const { settings, stale } = addHooks(start, SCRIPT, { exists });
  assert.equal(stale, 1);
  assert.equal(settings.hooks.Stop.length, 2);
  assert.deepEqual(otherCopies(settings, SCRIPT), [other]);
});

test('uninstall removes only our handlers and empty groups', () => {
  const installed = addHooks(userSettings(), SCRIPT).settings;
  const { settings, removed } = removeHooks(installed, SCRIPT);
  assert.equal(removed, 13);
  assert.deepEqual(settings, userSettings());
  const shared = { hooks: { Stop: [{ hooks: [userHook, hookHandler(SCRIPT)] }] } };
  assert.deepEqual(removeHooks(shared, SCRIPT).settings, { hooks: { Stop: [{ hooks: [userHook] }] } });
  assert.deepEqual(removeHooks(addHooks({}, SCRIPT).settings, SCRIPT).settings, {});
});

test('paths match whatever the slashes and letter case', () => {
  const handler = hookHandler('c:/users/ME/agent-office-3d/hooks/send-event.ps1');
  assert.equal(removeHooks({ hooks: { Stop: [{ hooks: [handler] }] } }, SCRIPT).removed, 1);
});

test('a file that is not a settings object is refused', () => {
  assert.throws(() => addHooks([], SCRIPT), /JSON object/);
  assert.throws(() => addHooks({ hooks: [] }, SCRIPT), /"hooks" is not an object/);
  assert.throws(() => addHooks({ hooks: { Stop: {} } }, SCRIPT), /not a list/);
  assert.throws(() => removeHooks({ hooks: { Stop: [{}] } }, SCRIPT), /without a "hooks" list/);
});

test('formatting follows the original file', () => {
  const crlf = '{\r\n    "model": "opus"\r\n}\r\n';
  const style = detectStyle(crlf);
  assert.deepEqual(style, { indent: '    ', eol: '\r\n', finalNewline: true });
  assert.equal(formatSettings(JSON.parse(crlf), style), crlf);
  assert.equal(formatSettings({ a: 1 }, detectStyle('{\n\t"a": 1\n}')), '{\n\t"a": 1\n}');
  assert.equal(formatSettings({}, detectStyle('')), '{}\n');
});

test('lineDiff shows changed lines with context', () => {
  const before = 'a\nb\nc\nd\ne\nf\ng\n';
  const after = 'a\nb\nc\nX\ne\nf\ng\n';
  assert.deepEqual(lineDiff(before, after, 1), [
    { op: '.', text: '...' },
    { op: ' ', text: 'c' },
    { op: '-', text: 'd' },
    { op: '+', text: 'X' },
    { op: ' ', text: 'e' },
  ].slice(1));
  assert.deepEqual(lineDiff('', '{}\n'), [{ op: '+', text: '{}' }]);
  assert.deepEqual(lineDiff('a\n', 'a\n'), []);
});

// ---- The CLI on scratch files (never the real ~/.claude/settings.json) ----

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao3d-setup-'));
  return { dir, settings: path.join(dir, 'claude', 'settings.json'), data: path.join(dir, 'data') };
}

function run(s, ...args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'setup.js'), ...args, '--settings', s.settings], {
    env: { ...process.env, AGENT_OFFICE_DATA: s.data, NO_COLOR: '1' },
    input: args.includes('--yes') ? '' : 'n\n',
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

const backups = (s) => fs.readdirSync(path.dirname(s.settings)).filter((f) => f.endsWith('.bak'));

test('cli: install, re-install, uninstall restores the original bytes', () => {
  const s = scratch();
  fs.mkdirSync(path.dirname(s.settings), { recursive: true });
  const original = '{\r\n    "model": "opus",\r\n    "env": { "A": "ü" }\r\n}\r\n';
  fs.writeFileSync(s.settings, original);

  const declined = run(s, 'install');
  assert.equal(declined.code, 2, declined.out);
  assert.equal(fs.readFileSync(s.settings, 'utf8'), original);
  assert.deepEqual(backups(s), []);

  const done = run(s, 'install', '--yes');
  assert.equal(done.code, 0, done.out);
  assert.match(done.out, /\+ +"async": true/);
  const written = fs.readFileSync(s.settings, 'utf8');
  assert.match(written, /\r\n {4}"model": "opus",/);
  assert.equal(JSON.parse(written).env.A, 'ü');
  assert.equal(backups(s).length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(s.settings), backups(s)[0]), 'utf8'), original);

  const again = run(s, 'install', '--yes');
  assert.equal(again.code, 0);
  assert.match(again.out, /Already installed/);
  assert.equal(run(s, 'status').code, 0);

  const removed = run(s, 'uninstall', '--yes');
  assert.equal(removed.code, 0, removed.out);
  assert.match(removed.out, /goes back to the copy saved/);
  assert.equal(fs.readFileSync(s.settings, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(s.data, 'install.json')), false);
  assert.equal(run(s, 'status').code, 3);
});

test('cli: uninstall after the user changed the file removes only our hooks', () => {
  const s = scratch();
  assert.equal(run(s, 'install', '--yes').code, 0); // no file yet: it is created
  const data = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
  data.theme = 'dark';
  fs.writeFileSync(s.settings, JSON.stringify(data, null, 2) + '\n');
  const out = run(s, 'uninstall', '--yes');
  assert.equal(out.code, 0, out.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(s.settings, 'utf8')), { theme: 'dark' });
});

test('cli: a file the installer created is deleted again', () => {
  const s = scratch();
  assert.equal(run(s, 'install', '--yes').code, 0);
  assert.equal(run(s, 'uninstall', '--yes').code, 0);
  assert.equal(fs.existsSync(s.settings), false);
});

test('cli: invalid JSON is left alone', () => {
  const s = scratch();
  fs.mkdirSync(path.dirname(s.settings), { recursive: true });
  fs.writeFileSync(s.settings, '{ "model": "opus", }');
  const out = run(s, 'install', '--yes');
  assert.equal(out.code, 1);
  assert.match(out.out, /not valid JSON/);
  assert.equal(fs.readFileSync(s.settings, 'utf8'), '{ "model": "opus", }');
  assert.deepEqual(backups(s), []);
});
