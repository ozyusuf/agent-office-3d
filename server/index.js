// agent-office-3d server: hook events in (POST /event), browsers out (WebSocket /ws), settings from
// the HUD's panel in (POST /config).
// Listens on 127.0.0.1 only. See CLAUDE.md for the architecture and docs/DECISIONS.md for why.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { normalize } from './normalize.js';
import { loadConfig, checkUpdate, saveConfig } from './config.js';
import { HudState } from './state.js';
import { loadStats, createStatsWriter } from './stats.js';
import { readContext } from './transcript.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB_DIR = path.join(ROOT, 'web');
// three.js is served from node_modules (no bundler). Only its ES module folders are reachable.
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const THREE_PREFIX = '/vendor/three/';
const THREE_PARTS = [path.join(THREE_DIR, 'build') + path.sep, path.join(THREE_DIR, 'examples', 'jsm') + path.sep];
// Env overrides let tests run a second server without touching the user's config or stats.
const CONFIG_FILE = path.resolve(ROOT, process.env.AGENT_OFFICE_CONFIG || 'config.json');
const DATA_DIR = path.resolve(ROOT, process.env.AGENT_OFFICE_DATA || 'data');
const { version } = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));

const { config, warnings } = loadConfig(CONFIG_FILE);
for (const warning of warnings) console.warn(`Warning: ${warning}`);

const HOST = '127.0.0.1';
const PORT = config.port;
const REORDER_MS = 350; // how long an event waits for earlier-fired hooks (D3)
const HISTORY_SIZE = 200; // recent events replayed to a browser when it connects
const MAX_BODY = 16 * 1024 * 1024; // hook input can include large tool output
const MAX_CONFIG_BODY = 16 * 1024; // a settings update is a few short values

const statsFile = path.join(DATA_DIR, 'stats.json');
const loaded = loadStats(statsFile);
if (loaded.warning) console.warn(`Warning: ${loaded.warning}`);
const hud = new HudState({ xp: loaded.xp });
const statsWriter = createStatsWriter(statsFile);

const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// ---- Event pipeline: receive -> reorder -> history + broadcast ----

const history = [];
const pending = [];
let nextId = 1;
let arrivalSeq = 0;
let flushTimer = null;

function enqueue(event) {
  pending.push({ event, seq: arrivalSeq++ });
  pending.sort((a, b) => a.event.hookTs - b.event.hookTs || a.seq - b.seq);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer || pending.length === 0) return;
  const wait = Math.max(0, pending[0].event.receivedAt + REORDER_MS - Date.now());
  flushTimer = setTimeout(() => {
    flushTimer = null;
    // Release from the head only, so order is kept even if a later arrival sorts first.
    while (pending.length && Date.now() - pending[0].event.receivedAt >= REORDER_MS) {
      publish(pending.shift().event);
    }
    scheduleFlush();
  }, wait);
}

function publish(event) {
  event.id = nextId++;
  history.push(event);
  if (history.length > HISTORY_SIZE) history.shift();
  if (hud.apply(event)) statsWriter.save(hud.xp);
  const message = JSON.stringify({ type: 'event', event, state: hud.snapshot() });
  for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message);
  logEvent(event);
}

function logEvent(e) {
  const time = new Date(e.hookTs).toLocaleTimeString('en-GB');
  const parts = [e.event, e.tool, e.target, e.source, e.reason, e.trigger, e.error, e.agentType].filter(Boolean);
  console.log(`[${time}] ${parts.join(' · ')}`);
}

// ---- Context size from the session transcript (D55) ----

const transcripts = new Map(); // session id -> { file, timer, followUp }
const CONTEXT_DEBOUNCE_MS = 500;
const CONTEXT_FOLLOW_UP_MS = 2500; // the transcript is written asynchronously and may lag

function watchContext(raw) {
  // Only main-thread events: a subagent works in a context of its own.
  if (raw?.agent_id || typeof raw?.session_id !== 'string' || typeof raw?.transcript_path !== 'string') return;
  let w = transcripts.get(raw.session_id);
  if (!w) {
    w = { file: raw.transcript_path, timer: null, followUp: null };
    transcripts.set(raw.session_id, w);
    if (transcripts.size > 8) transcripts.delete(transcripts.keys().next().value);
  }
  w.file = raw.transcript_path;
  clearTimeout(w.timer);
  clearTimeout(w.followUp);
  w.timer = setTimeout(() => checkContext(raw.session_id), CONTEXT_DEBOUNCE_MS);
  w.followUp = setTimeout(() => checkContext(raw.session_id), CONTEXT_FOLLOW_UP_MS);
}

async function checkContext(sessionId) {
  const w = transcripts.get(sessionId);
  if (!w) return;
  const found = await readContext(w.file);
  if (found && hud.setContextTokens(sessionId, found)) {
    const message = JSON.stringify({ type: 'state', state: hud.snapshot() });
    for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message);
  }
}

// ---- HTTP ----

function handleEvent(req, res) {
  // Only the hook script sends this header; a browser page cannot without a CORS preflight (D6).
  if (req.headers['x-agent-office'] !== '1' || req.headers.origin) {
    req.resume();
    return sendText(res, 403, 'Forbidden');
  }
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_BODY) return sendText(res, 413, 'Too large');
    res.writeHead(204).end();
    let raw;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
    } catch {
      return;
    }
    const event = normalize(raw, { receivedAt: Date.now(), hookTs: Number(req.headers['x-hook-ts']) });
    if (event) {
      enqueue(event);
      watchContext(raw);
    }
  });
}

// Settings panel: validated update -> config.json -> every open page (D46).
function handleConfig(req, res) {
  // Only our own page may write: same-origin Origin, our header, JSON. A foreign page cannot send
  // this Origin, and its custom header would need a CORS preflight that we never answer (D6).
  const json = /^application\/json\b/.test(req.headers['content-type'] ?? '');
  if (!allowedOrigins.has(req.headers.origin) || req.headers['x-agent-office'] !== '1' || !json) {
    req.resume();
    return sendText(res, 403, 'Forbidden');
  }
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_CONFIG_BODY) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_CONFIG_BODY) return sendJson(res, { ok: false, errors: [{ key: null, message: 'too large' }] }, 413);
    let patch;
    try {
      patch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return sendJson(res, { ok: false, errors: [{ key: null, message: 'not JSON' }] }, 400);
    }
    const { values, errors } = checkUpdate(patch);
    if (errors.length) return sendJson(res, { ok: false, errors }, 400);
    let saved;
    try {
      saved = saveConfig(CONFIG_FILE, values);
    } catch (err) {
      console.error(`Could not save ${CONFIG_FILE}: ${err.message}`);
      return sendJson(res, { ok: false, errors: [{ key: null, message: `could not write config.json: ${err.code ?? err.message}` }] }, 500);
    }
    for (const warning of saved.warnings) console.warn(`Warning: ${warning}`);
    // The port stays what the server listens on; everything else applies at once.
    Object.assign(config, saved.config, { port: PORT });
    console.log(`Settings saved: ${Object.keys(values).join(', ')}`);
    sendJson(res, { ok: true, config });
    const message = JSON.stringify({ type: 'config', config });
    for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message);
  });
}

async function serveStatic(pathname, res) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Bad path');
  }
  let file;
  if (rel.startsWith(THREE_PREFIX)) {
    file = path.resolve(THREE_DIR, rel.slice(THREE_PREFIX.length));
    if (!file.endsWith('.js') || !THREE_PARTS.some((dir) => file.startsWith(dir))) return sendText(res, 404, 'Not found');
  } else {
    file = path.resolve(WEB_DIR, rel.replace(/^\/+/, ''));
    if (!file.startsWith(WEB_DIR + path.sep)) return sendText(res, 404, 'Not found');
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // Host check blocks DNS-rebinding pages from talking to us (D6).
  if (!allowedHosts.has(req.headers.host)) return sendText(res, 403, 'Forbidden host');
  const { pathname } = new URL(req.url, 'http://local');
  if (req.method === 'POST' && pathname === '/event') return handleEvent(req, res);
  if (req.method === 'POST' && pathname === '/config') return handleConfig(req, res);
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, { ok: true, version, clients: wss.clients.size, events: nextId - 1 });
  }
  if (req.method === 'GET' && pathname === '/state') return sendJson(res, { config, state: hud.snapshot() });
  if (req.method === 'GET') return serveStatic(pathname, res);
  sendText(res, 405, 'Method not allowed');
});

// ---- WebSocket ----

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://local');
  const ok = pathname === '/ws' && allowedHosts.has(req.headers.host) && allowedOrigins.has(req.headers.origin);
  if (!ok) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', version, config, history, state: hud.snapshot() }));
});

// ---- Start / stop ----

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the server already running? Set AGENT_OFFICE_PORT to use another port.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`agent-office-3d ${version} listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    statsWriter.flush();
    for (const client of wss.clients) client.close(1001, 'server shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
