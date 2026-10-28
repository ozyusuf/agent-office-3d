// hooks/send-event.sh (Linux, macOS): the same contract as send-event.ps1 (D1-D5, D70). Runs the real
// script against a scratch server on a random port, never the server the user watches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = path.join(ROOT, 'hooks', 'send-event.sh');
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const skip = process.platform === 'win32' || !has('sh') || !has('curl') ? 'needs sh and curl' : false;

function runHook(input, env = {}, script = HOOK) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('sh', [script], { env: { ...process.env, AGENT_OFFICE_PORT: '', ...env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

function scratchServer() {
  const got = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      got.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(204).end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, got, port: server.address().port })));
}

test('the hook script is ASCII-only', () => {
  assert.ok(/^[\x00-\x7f]*$/.test(fs.readFileSync(HOOK, 'latin1')));
});

test('sh hook: forwards the event bytes unchanged, with our headers and no Origin', { skip }, async () => {
  const { server, got, port } = await scratchServer();
  try {
    const body = '{"hook_event_name":"Stop","session_id":"t","note":"ü ✓ \\"q\\""}';
    const before = Date.now();
    const r = await runHook(body, { AGENT_OFFICE_PORT: String(port) });
    assert.equal(r.code, 0);
    assert.equal(r.out, '', 'the hook never writes to stdout');
    assert.equal(got.length, 1);
    const [req] = got;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/event');
    assert.equal(req.body.toString('utf8'), body);
    assert.equal(req.headers['x-agent-office'], '1');
    assert.equal(req.headers.origin, undefined);
    assert.equal(req.headers.host, `127.0.0.1:${port}`);
    assert.match(req.headers['content-type'], /^application\/json/);
    const ts = Number(req.headers['x-hook-ts']);
    assert.ok(ts >= before - 1500 && ts <= Date.now(), `hook ts ${ts} is the start time in ms`);
  } finally {
    server.close();
  }
});

test('sh hook: reads the port from config.json next to the project', { skip }, async () => {
  const { server, got, port } = await scratchServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao3d-hook-'));
  try {
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.copyFileSync(HOOK, path.join(dir, 'hooks', 'send-event.sh'));
    fs.writeFileSync(path.join(dir, 'config.json'), `{\n  "agentName": "x",\n  "port": ${port}\n}\n`);
    const r = await runHook('{"hook_event_name":"Stop"}', {}, path.join(dir, 'hooks', 'send-event.sh'));
    assert.equal(r.code, 0);
    assert.equal(got.length, 1);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sh hook: exits 0 at once and silently when no server runs', { skip }, async () => {
  const { server, port } = await scratchServer();
  await new Promise((resolve) => server.close(resolve)); // a port that was just free
  const r = await runHook('{"hook_event_name":"Stop"}', { AGENT_OFFICE_PORT: String(port) });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.ok(r.ms < 1500, `took ${r.ms} ms`);
});

test('sh hook: a bad port is ignored quietly', { skip }, async () => {
  const r = await runHook('{"hook_event_name":"Stop"}', { AGENT_OFFICE_PORT: '78; touch /tmp/x' });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});
