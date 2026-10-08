// HUD: renders the server's session state and the Hook Flow log. Every number and bar comes from
// the server snapshot (built from real hook events); before the first event the HUD says so.
// All text goes through textContent: file names and commands may contain HTML.

import { connectLive } from './ws.js';
import { LANGS, makeTranslator } from './i18n.js';
import { logEntry, activityParts, formatDuration } from './narrate.js';
import { STATIONS, activeStations } from './stations.js';

const LOG_LINES = 200;
const EVENTS_KEPT = 400; // PostToolUse events add no line, so keep more events than lines
const EFFORT_STEPS = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
const APP_NAME = 'agent-office-3d'; // banner title unless config.json sets realmTitle

const $ = (id) => document.getElementById(id);

const view = {
  conn: 'connecting',
  config: null, // from the server's hello
  hud: null, // latest server snapshot: { stats, liveSessions, focus }
  events: [], // recent events for the log
  lang: langFromUrl(), // explicit choice in this page; otherwise config.language
  multiSession: false,
};
let t = makeTranslator(view.lang ?? 'en');

function langFromUrl() {
  const lang = new URLSearchParams(location.search).get('lang');
  return LANGS.includes(lang) ? lang : null;
}

// ---- Rendering ----

function renderAll() {
  applyLanguage();
  renderTop();
  renderStats();
  renderCharacter();
  renderStations();
  renderSkills();
  renderLog();
}

function renderLive() {
  renderTop();
  renderStats();
  renderCharacter();
  renderStations();
  renderSkills();
}

function applyLanguage() {
  t = makeTranslator(view.lang ?? view.config?.language ?? 'en');
  document.documentElement.lang = t.lang; // also makes CSS uppercase Turkish i -> İ correctly
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === t.lang));
  }
  $('icon-settings').title = t('settings');
  $('icon-settings').setAttribute('aria-label', t('settings'));
  $('log-empty').textContent = view.hud ? t('waitingEvents') : t('connecting');
  $('stats-empty').textContent = t('waitingEvents');
}

function renderTop() {
  const title = view.config?.realmTitle || APP_NAME;
  $('realm-title').textContent = title;
  document.title = title;
  const subtitle = view.config?.realmSubtitle || view.hud?.focus?.project || '';
  $('realm-subtitle').textContent = subtitle;
  // Hidden when unknown, or when it would repeat the title (e.g. working in this repo itself).
  $('realm-subtitle').hidden = !subtitle || subtitle.toLowerCase() === title.toLowerCase();

  setIcon($('icon-conn'), view.conn, t(`conn.${view.conn}`));
  const status = view.hud?.focus?.status ?? 'none';
  setIcon($('icon-session'), status, t(`status.${status}`));
}

function setIcon(node, state, label) {
  node.dataset.state = state;
  node.title = label;
  node.setAttribute('aria-label', label);
}

function renderStats() {
  const focus = view.hud?.focus;
  const status = focus?.status ?? 'none';
  $('stats').dataset.status = status;
  $('status-text').textContent = view.hud ? t(`status.${status}`) : t('connecting');
  $('stats-empty').hidden = Boolean(focus);
  $('meters').hidden = !focus;
  $('tools-done').textContent = focus ? t('toolsDone', { n: focus.toolsDone }) : '';
  if (!focus) return;

  const max = view.config.contextBarMax;
  setMeter('context', focus.context / max, `${focus.contextExact ? '' : '≥'}${focus.context} / ${max}`,
    focus.contextExact ? t('tip.context', { max }) : t('tip.contextLow'));

  const step = EFFORT_STEPS[focus.effort];
  setMeter('effort', step ? step / 5 : 0, focus.effort ? t.word('effort', focus.effort) : '–',
    focus.effort ? t('tip.effort') : t('tip.effortNone'));

  renderTime();
}

function renderTime() {
  const focus = view.hud?.focus;
  if (!focus) return;
  const elapsed = (focus.endedAt ?? Date.now()) - focus.startedAt;
  const minutes = view.config.sessionBarMinutes;
  setMeter('time', elapsed / (minutes * 60000), `${focus.startExact ? '' : '≥'}${formatDuration(elapsed, t)}`,
    focus.startExact ? t('tip.time', { max: minutes }) : t('tip.timeLow'));
}

function setMeter(name, fraction, value, tip) {
  const meter = document.querySelector(`[data-meter="${name}"]`);
  meter.querySelector('.fill').style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  meter.querySelector('.value').textContent = value;
  meter.title = tip;
}

function renderCharacter() {
  const stats = view.hud?.stats;
  $('lvl').textContent = stats ? String(stats.level) : '–';
  $('xp-fill').style.width = stats ? `${stats.progress * 100}%` : '0';
  $('xp-text').textContent = stats
    ? t('xp', { xp: stats.xp - stats.levelXp, next: stats.nextLevelXp - stats.levelXp })
    : '';
  $('char-label').title = stats ? t('tip.xp', { level: stats.level, total: stats.xp }) : '';

  $('char-label').dataset.status = view.hud?.focus?.status ?? 'none';
  const line = $('char-line');
  line.replaceChildren();
  if (view.config?.agentName) line.append(el('span', 'name', view.config.agentName), el('span', 'sep', '·'));
  if (view.hud) appendParts(line, activityParts(view.hud.focus, t));
  else line.append(t('connecting'));
  line.title = line.textContent;
}

function renderStations() {
  const layer = $('station-labels');
  if (!layer.children.length) {
    for (const station of STATIONS) {
      const label = el('div', 'station-label');
      label.dataset.station = station.key;
      if (station.slot) {
        label.style.left = `${station.slot[0] * 100}%`;
        label.style.top = `${station.slot[1] * 100}%`;
      } else {
        label.hidden = true; // positioned by the 3D scene in stage 3
      }
      layer.append(label);
    }
  }
  const on = activeStations(view.hud?.focus);
  for (const label of layer.children) {
    label.textContent = t(`station.${label.dataset.station}`);
    label.dataset.active = String(on.has(label.dataset.station));
  }
}

function renderSkills() {
  const focus = view.hud?.focus;
  const kinds = new Set(focus?.activeKinds ?? []);
  for (const skill of document.querySelectorAll('.skill')) {
    const key = skill.dataset.skill;
    let state = 'idle';
    let name = t(`skill.${key}`);
    if (key === 'permission') {
      if (focus?.status === 'waiting') {
        state = 'waiting';
        name = t('skill.permissionWaiting');
      }
    } else if (kinds.has(key)) {
      state = 'active';
    }
    skill.dataset.state = state;
    skill.querySelector('.name').textContent = name;
    skill.querySelector('.tag').textContent = state === 'active' ? `(${t('active')})` : '';
  }
}

// ---- Hook Flow log ----

function renderLog() {
  const list = $('log');
  const stick = atBottom(list);
  view.multiSession = new Set(view.events.map((e) => e.sessionId)).size > 1;
  const items = view.events.map(logItem).filter(Boolean).slice(-LOG_LINES);
  list.replaceChildren(...items);
  $('log-empty').hidden = items.length > 0;
  if (stick) list.scrollTop = list.scrollHeight;
}

function appendLog(event) {
  view.events.push(event);
  if (view.events.length > EVENTS_KEPT) view.events.shift();
  if (!view.multiSession && view.events.some((e) => e.sessionId !== event.sessionId)) {
    renderLog(); // a second session appeared: every line gets a session tag
    return;
  }
  const item = logItem(event);
  if (!item) return;
  const list = $('log');
  const stick = atBottom(list);
  list.append(item);
  while (list.children.length > LOG_LINES) list.firstElementChild.remove();
  $('log-empty').hidden = true;
  if (stick) list.scrollTop = list.scrollHeight;
}

function logItem(e) {
  const entry = logEntry(e, t);
  if (!entry) return null;
  const item = el('li');
  item.dataset.tone = entry.tone;
  item.append(el('span', 'ts', `[${clock(e.hookTs)}]`), ' ');
  if (view.multiSession) item.append(el('span', 'sid', (e.sessionId ?? '?').slice(0, 4)), ' ');
  // ↳ marks calls made inside a subagent (SubagentStart/Stop carry agent_id too but are main-thread events).
  if (e.agentId && !e.event.startsWith('Subagent')) item.append(el('span', 'sub', '↳ '));
  const message = el('span', 'msg');
  appendParts(message, entry.parts);
  item.append(message);
  item.title = item.textContent;
  return item;
}

function atBottom(list) {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 24;
}

// ---- Helpers ----

function appendParts(parent, parts) {
  for (const part of parts) parent.append(typeof part === 'string' ? part : el('span', 'v', part.v));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- Settings menu (full settings panel arrives in stage 5) ----

function setupSettings() {
  const button = $('icon-settings');
  const menu = $('settings');
  const toggle = (open) => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggle(menu.hidden);
  });
  menu.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') toggle(false);
  });
  for (const langButton of menu.querySelectorAll('[data-lang]')) {
    langButton.addEventListener('click', () => {
      view.lang = langButton.dataset.lang; // this page only; the saved default is config.json
      renderAll();
    });
  }
}

// ---- Start ----

setupSettings();
renderAll();

connectLive({
  onStatus(state) {
    view.conn = state;
    renderTop();
  },
  onHello(data) {
    view.config = data.config;
    view.hud = data.state;
    view.events = data.history.slice(-EVENTS_KEPT);
    renderAll();
  },
  onEvent(data) {
    view.hud = data.state;
    appendLog(data.event);
    renderLive();
  },
});

// Session timer: real elapsed time since SessionStart; paused while the tab is hidden.
setInterval(() => {
  if (!document.hidden && view.hud?.focus && view.hud.focus.endedAt === null) renderTime();
}, 1000);
