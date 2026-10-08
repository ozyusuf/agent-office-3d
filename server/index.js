// agent-office-3d server: hook events in (POST /event), browsers out (WebSocket /ws).
// Listens on 127.0.0.1 only. See CLAUDE.md for the architecture and docs/DECISIONS.md for why.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { normalize } from './normalize.js';
import { loadConfig } from './config.js';
import { HudState } from './state.js';
import { loadStats, createStatsWriter } from './stats.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB_DIR = path.join(ROOT, 'web');
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
    if (event) enqueue(event);
  });
}

async function serveStatic(pathname, res) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return sendText(res, 400, 'Bad path');
  }
  const file = path.resolve(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR + path.sep)) return sendText(res, 404, 'Not found');
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

function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // Host check blocks DNS-rebinding pages from talking to us (D6).
  if (!allowedHosts.has(req.headers.host)) return sendText(res, 403, 'Forbidden host');
  const { pathname } = new URL(req.url, 'http://local');
  if (req.method === 'POST' && pathname === '/event') return handleEvent(req, res);
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
