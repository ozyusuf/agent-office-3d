// Debug view: raw live list of hook events plus the server's HUD state (docs/DECISIONS.md D12).
// All text goes through textContent: prompts and commands may contain HTML.

import { connectLive } from './ws.js';

const MAX_ROWS = 500;

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const conn = document.getElementById('conn');
const count = document.getElementById('count');
const stateBox = document.getElementById('state');
let shown = 0;
let config = null;

const CATEGORY = {
  SessionStart: 'session', SessionEnd: 'session',
  UserPromptSubmit: 'prompt',
  PreToolUse: 'tool', PostToolUse: 'done', PostToolUseFailure: 'failure',
  PermissionRequest: 'permission',
  SubagentStart: 'agent', SubagentStop: 'agent',
  PreCompact: 'compact', PostCompact: 'compact',
  Stop: 'stop', StopFailure: 'failure',
};

const STATUS_TEXT = { connecting: 'connecting…', open: 'connected', closed: 'server offline - retrying' };

function showState(state) {
  stateBox.textContent = JSON.stringify({ config, state }, null, 2);
}

function addRow(e) {
  const row = el('li');
  const details = el('details');
  const summary = el('summary');

  summary.append(el('span', 'time', formatTime(e.hookTs)));
  const badge = el('span', 'ev', e.event);
  badge.dataset.cat = CATEGORY[e.event] ?? 'tool';
  summary.append(badge);

  const what = el('span', 'what');
  if (e.tool) what.append(el('span', 'tool', e.tool), ' ');
  if (e.target) what.append(el('span', 'target', e.target));
  const extra = [
    e.source, e.reason, e.trigger, e.error, e.errorDetails, e.errorType, e.interrupted && 'interrupted',
    e.agentType && `agent: ${e.agentType}`,
    e.promptPreview && `“${e.promptPreview}”`, Number.isFinite(e.durationMs) && `${e.durationMs} ms`,
    e.effort && `effort: ${e.effort}`, e.project,
  ].filter(Boolean);
  if (extra.length) what.append(el('span', 'extra', extra.join(' · ')));
  summary.append(what);

  details.append(summary, el('pre', null, JSON.stringify(e, null, 2)));
  row.append(details);
  list.prepend(row);

  shown++;
  while (list.children.length > MAX_ROWS) list.lastElementChild.remove();
  updateCount();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(ms) {
  const d = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function setConn(state, text) {
  conn.dataset.state = state;
  conn.textContent = text;
}

function updateCount() {
  count.textContent = `${shown} event${shown === 1 ? '' : 's'}`;
  empty.hidden = shown > 0;
}

document.getElementById('clear').addEventListener('click', () => {
  list.replaceChildren();
  shown = 0;
  updateCount();
});

connectLive({
  onStatus: (state) => setConn(state, STATUS_TEXT[state]),
  onHello: (data) => {
    list.replaceChildren();
    shown = 0;
    data.history.forEach(addRow);
    config = data.config;
    showState(data.state);
    updateCount();
  },
  onEvent: (data) => {
    addRow(data.event);
    showState(data.state);
  },
});
