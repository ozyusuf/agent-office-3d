// HUD: renders the server's session state and the Hook Flow log. Every number and bar comes from
// the server snapshot (built from real hook events); before the first event the HUD says so.
// All text goes through textContent: file names and commands may contain HTML.

import { connectLive } from './ws.js';
import { LANGS, makeTranslator } from './i18n.js';
import { logEntry, activityParts, glanceOf, formatDuration } from './narrate.js';
import { STATIONS, activeStations } from './stations.js';
import { createLabelLayer } from './labels.js';
import { createSettings } from './settings.js';
import { accentPair, DEFAULT_ACCENT } from './palette.js';
import { contextFill, windowFor, formatTokens } from './context.js';

const LOG_LINES = 200;
const EVENTS_KEPT = 400; // PostToolUse events add no line, so keep more events than lines
const EFFORT_STEPS = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
const APP_NAME = 'agent-office-3d'; // banner title unless config.json sets realmTitle

const $ = (id) => document.getElementById(id);

const view = {
  conn: 'connecting',
  hud: null, // latest server snapshot: { stats, liveSessions, focus }
  events: [], // recent events for the log
  lang: langFromUrl(), // ?lang= for this tab only; otherwise config.language
  multiSession: false,
  // 3D quality for this tab only (?bloom=0|1&pr=1|1.5|2&fps=30|60); otherwise config.json
  bloom: fromUrl('bloom', (v) => (v === '1' ? true : v === '0' ? false : null)),
  pixelRatioCap: fromUrl('pr', (v) => (Number(v) >= 0.5 && Number(v) <= 3 ? Number(v) : null)),
  maxFps: fromUrl('fps', (v) => (v === '30' || v === '60' ? Number(v) : null)),
  hour: fromUrl('hour', (v) => (v !== '' && Number(v) >= 0 && Number(v) < 24 ? Number(v) : null)), // fixed sky time
};
let t = makeTranslator(view.lang ?? 'en');
let realm = null; // the 3D scene once loaded; stays null without WebGL
const labels = createLabelLayer($('labels'), $('middle'));

function langFromUrl() {
  const lang = new URLSearchParams(location.search).get('lang');
  return LANGS.includes(lang) ? lang : null;
}

function fromUrl(name, parse) {
  const value = new URLSearchParams(location.search).get(name);
  return value === null ? null : parse(value);
}

// ---- Rendering ----

function renderAll() {
  applyLanguage();
  renderTop();
  renderStats();
  renderCharacter();
  renderStations();
  renderSkills();
  renderTint();
  renderLog();
}

function renderLive() {
  renderTop();
  renderStats();
  renderCharacter();
  renderStations();
  renderSkills();
  renderTint();
  renderGlance();
}

/** The glance state (D68): the window frame and the bubble over the nameplate. */
function renderGlance() {
  const glance = view.hud ? glanceOf(view.hud.focus, t) : null;
  $('frame').dataset.kind = cfg().statusFrame !== false && glance && glance.kind !== 'work' ? glance.kind : '';
  const bubble = $('bubble');
  const mark = glance?.mark ?? '';
  if (bubble.hidden !== !mark) bubble.hidden = !mark;
  bubble.textContent = mark;
  bubble.dataset.kind = glance?.kind ?? '';
}

// The bubble hops while Claude waits for the user (moved on every rendered 3D frame, at the
// scene's pace, not by an endless CSS animation, D67). Done and error stay still: they can last
// for hours, and a moving bubble is repainted every frame (~6 % CPU measured).
const HOP_S = 1.1;
const calmMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function moveBubble() {
  const bubble = $('bubble');
  const hop = !bubble.hidden && !calmMotion && bubble.dataset.kind === 'wait';
  if (!hop) {
    if (bubble.style.transform) bubble.style.transform = '';
    return;
  }
  const p = ((performance.now() / 1000) % HOP_S) / HOP_S;
  const y = p < 0.42 ? -9 * Math.sin((p / 0.42) * Math.PI) : 0;
  bubble.style.transform = `translateY(${y.toFixed(1)}px)`;
}

/** Header chip: the glance word and since when ("Done · 4m 05s"); "≥" when the server joined late. */
function statusText(focus) {
  const glance = glanceOf(focus, t);
  if (!glance) return t(`status.${focus?.status ?? 'none'}`);
  const since = focus.statusSince;
  return Number.isFinite(since)
    ? `${glance.word} · ${focus.statusExact ? '' : '≥'}${formatDuration(Date.now() - since, t)}`
    : glance.word;
}

// Scene tint: yellow while waiting for permission, red after an API error (StopFailure).
function renderTint() {
  const status = view.hud?.focus?.status;
  $('tint').dataset.state = status === 'waiting' || status === 'error' ? status : '';
}

function applyLanguage() {
  t = makeTranslator(view.lang ?? cfg().language ?? 'en');
  document.documentElement.lang = t.lang; // also makes CSS uppercase Turkish i -> İ correctly
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
    node.setAttribute('aria-label', node.title);
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  $('icon-settings').title = t('settings');
  $('icon-settings').setAttribute('aria-label', t('settings'));
  $('log-empty').textContent = view.hud ? t('waitingEvents') : t('connecting');
  $('stats-empty').textContent = t('waitingEvents');
  renderQuality();
}

// Accent colour: replaces --neon-cyan / --neon-cyan-soft (every HUD colour derived from them
// follows) and the neon of the 3D scene. The default leaves theme.css as measured.
let accentShown = DEFAULT_ACCENT;
function applyAccent() {
  const hex = cfg().accentColor ?? DEFAULT_ACCENT;
  if (hex === accentShown) return;
  accentShown = hex;
  const { css } = accentPair(hex);
  const root = document.documentElement.style;
  if (hex === DEFAULT_ACCENT) {
    root.removeProperty('--neon-cyan');
    root.removeProperty('--neon-cyan-soft');
  } else {
    root.setProperty('--neon-cyan', css.main);
    root.setProperty('--neon-cyan-soft', css.soft);
  }
  realm?.setAccent(hex);
}

function renderTop() {
  const title = cfg().realmTitle || APP_NAME;
  $('realm-title').textContent = title;
  // The app's own name is English: uppercase it as English (no Turkish İ); a custom title follows the page.
  $('realm-title').lang = cfg().realmTitle ? '' : 'en';
  // The tab / taskbar title starts with the glance word ("Done · agent-office-3d").
  const glance = view.hud ? glanceOf(view.hud.focus, t) : null;
  document.title = glance ? `${glance.word} · ${title}` : title;
  const subtitle = cfg().realmSubtitle || view.hud?.focus?.project || '';
  $('realm-subtitle').textContent = subtitle;
  // Hidden when unknown, or when it would repeat the title (e.g. working in this repo itself).
  $('realm-subtitle').hidden = !subtitle || subtitle.toLowerCase() === title.toLowerCase();

  setIcon($('icon-conn'), view.conn, t(`conn.${view.conn}`));
  const status = view.hud?.focus?.status ?? 'none';
  const caption = glance ? glance.caption.map((p) => (typeof p === 'string' ? p : p.v)).join('') : t(`status.${status}`);
  setIcon($('icon-session'), status, caption);
  $('icon-session').dataset.glance = glance?.kind ?? '';
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
  $('status-text').textContent = view.hud ? statusText(focus) : t('connecting');
  $('stats-empty').hidden = Boolean(focus);
  $('meters').hidden = !focus;
  $('tools-done').textContent = focus ? t('toolsDone', { n: focus.toolsDone }) : '';
  if (!focus) return;

  const fill = contextFill(focus, cfg());
  if (Number.isFinite(focus.tokens)) {
    // Real tokens from the session transcript (D55).
    const auto = !Number.isFinite(cfg().contextWindow);
    const win = windowFor(focus.tokens, cfg().contextWindow);
    setMeter('context', fill, `${formatTokens(focus.tokens)} / ${formatTokens(win)}`,
      t(auto ? 'tip.tokensAuto' : 'tip.tokens', { tokens: focus.tokens.toLocaleString(t.lang), window: formatTokens(win), model: focus.tokensModel ?? '?' }));
  } else {
    // Fallback until the transcript can be read: tool calls since the last compaction.
    const max = cfg().contextBarMax;
    setMeter('context', fill, `${focus.contextExact ? '' : '≥'}${focus.context} / ${max}`,
      focus.contextExact ? t('tip.context', { max }) : t('tip.contextLow'));
  }

  const step = EFFORT_STEPS[focus.effort];
  setMeter('effort', step ? step / 5 : 0, focus.effort ? t.word('effort', focus.effort) : '–',
    focus.effort ? t('tip.effort') : t('tip.effortNone'));

  renderTime();
}

function renderTime() {
  const focus = view.hud?.focus;
  if (!focus) return;
  const elapsed = (focus.endedAt ?? Date.now()) - focus.startedAt;
  const minutes = cfg().sessionBarMinutes;
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
  $('lvl-badge').style.setProperty('--xp', stats ? String(stats.progress) : '0'); // XP ring around the level
  $('xp-text').textContent = stats
    ? t('xp', { xp: stats.xp - stats.levelXp, next: stats.nextLevelXp - stats.levelXp })
    : '';
  $('char-label').title = stats ? t('tip.xp', { level: stats.level, total: stats.xp }) : '';

  $('char-label').dataset.status = view.hud?.focus?.status ?? 'none';
  const away = !view.hud?.focus || view.hud.focus.status === 'ended';
  if ($('char-label').hidden !== Boolean(realm && away)) $('char-label').hidden = Boolean(realm && away);
  const line = $('char-line');
  line.replaceChildren();
  if (cfg().agentName) line.append(el('span', 'name', cfg().agentName), el('span', 'sep', '·'));
  if (view.hud) appendParts(line, activityParts(view.hud.focus, t));
  else line.append(t('connecting'));
  line.title = line.textContent;
  labels.changed($('char-label'));
}

const stationLabels = STATIONS.filter((s) => s.label !== 'never').map((station) => {
  const label = el('div', 'station-label');
  label.dataset.station = station.key;
  label.dataset.anchor = station.key;
  if (station.slot) label.dataset.slot = station.slot.join(',');
  $('labels').prepend(label);
  return { station, label };
});

function renderStations() {
  const on = activeStations(view.hud?.focus);
  for (const { station, label } of stationLabels) {
    const active = on.has(station.key);
    // Without the 3D scene only the labels with a fixed slot can be placed.
    const show = Boolean(realm || station.slot) && (station.label === 'always' || active);
    const text = t(`station.${station.key}`);
    if (label.hidden === show || label.textContent !== text) {
      label.hidden = !show;
      label.textContent = text;
      labels.changed(label);
    }
    label.dataset.active = String(active);
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
      if (focus?.waitFor === 'permission') {
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
  if (entry.tone === 'tool' && e.kind) item.dataset.kind = e.kind; // tool lines take their station's colour
  item.append(el('span', 'ts', clock(e.hookTs)));
  if (view.multiSession) item.append(el('span', 'sid', (e.sessionId ?? '?').slice(0, 4)));
  // ↳ marks calls made inside a subagent (SubagentStart/Stop carry agent_id too but are main-thread events).
  if (e.agentId && !e.event.startsWith('Subagent')) item.append(el('span', 'sub', '↳'));
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

// ---- Settings panel (web/settings.js) ----

const settings = createSettings({
  panel: $('settings'),
  button: $('icon-settings'),
  status: $('save-status'),
  translate: () => t,
  onChange: applyConfig,
});

/** The settings in use: the server's config.json values plus this tab's unsaved edits. */
function cfg() {
  return settings.effective();
}

/** The effective config changed (an edit in this tab, or a save from any tab): apply it live. */
function applyConfig(keys, byUser) {
  if (byUser) {
    // A choice made in the panel replaces this tab's URL override (?lang, ?bloom, ?pr, ?fps).
    if (keys.includes('language')) view.lang = null;
    if (keys.includes('bloom')) view.bloom = null;
    if (keys.includes('pixelRatioCap')) view.pixelRatioCap = null;
    if (keys.includes('maxFps')) view.maxFps = null;
  }
  if (view.hud) realm?.setState(view.hud, cfg()); // the context window drives the rack LEDs
  if (keys.includes('sky')) realm?.refreshSky();
  applyAccent();
  const lang = t.lang;
  applyLanguage();
  if (t.lang !== lang) renderLog();
  renderLive();
  applyQuality();
}

function renderSettings() {
  settings.render({ ...cfg(), language: t.lang, ...quality() });
}

// The measured frame rate is refreshed while the panel is open.
setInterval(() => {
  if (settings.isOpen()) renderQuality();
}, 1000);

// ---- 3D scene ----

/** The hour the sky shows: a fixed one (URL ?hour=, or the sky setting), or null = the local clock. */
const SKY_HOURS = { dawn: 6.4, day: 12, dusk: 18.3, night: 0.5 };
function skyHour() {
  return view.hour ?? SKY_HOURS[cfg().sky] ?? null;
}

/** The HUD's edge scrims take a deep shade of the current sky, so they melt into it. */
function applySky(sky) {
  const triplet = (hex) => `${(hex >> 16) & 255} ${(hex >> 8) & 255} ${hex & 255}`;
  const deep = (hex, k) => {
    let out = 0;
    for (const shift of [16, 8, 0]) out |= Math.round(((hex >> shift) & 255) * k + 4 * (1 - k)) << shift;
    return out;
  };
  const root = document.documentElement.style;
  root.setProperty('--scrim-top', triplet(deep(sky.top, 0.42)));
  root.setProperty('--scrim-bottom', triplet(deep(sky.low, 0.38)));
}

function quality() {
  return {
    bloom: view.bloom ?? cfg().bloom ?? true,
    pixelRatioCap: view.pixelRatioCap ?? cfg().pixelRatioCap ?? 1.5,
    maxFps: view.maxFps ?? cfg().maxFps ?? 60,
  };
}

function applyQuality() {
  const q = quality();
  realm?.setBloom(q.bloom);
  realm?.setPixelRatioCap(q.pixelRatioCap);
  realm?.setMaxFps(q.maxFps);
  renderQuality();
}

function renderQuality() {
  renderSettings();
  $('set-3d').hidden = !realm;
  const stats = realm?.stats();
  $('fps').textContent = !realm ? t('noScene') : stats.running ? t('fps', { fps: stats.fps, pace: t(`pace.${stats.pace}`), calls: stats.drawCalls }) : '';
}

async function startScene() {
  try {
    const { createRealm } = await import('./scene/realm.js');
    realm = createRealm($('scene'), {
      ...quality(),
      // The free middle area, plus a little room behind the glass panels above and below it.
      getViewRect: () => {
        const r = $('middle').getBoundingClientRect();
        return new DOMRect(r.left, r.top - 14, r.width, r.height + 14 + 28);
      },
      onFrame: () => {
        labels.update();
        moveBubble();
      },
      hour: skyHour,
      onSky: applySky,
    });
    labels.attach(realm);
    realm.setAccent(accentShown);
    if (view.hud) {
      realm.setState(view.hud, cfg());
      realm.seed(view.events);
    }
    // The free middle area changes with the window and with the panels' sizes.
    new ResizeObserver(() => realm.reframe()).observe($('middle'));
  } catch (err) {
    console.warn('3D scene unavailable:', err);
    realm = null;
  }
  renderStations();
  renderCharacter();
  renderQuality();
  labels.update();
}

// ---- Start ----

renderAll();
startScene();

connectLive({
  onStatus(state) {
    view.conn = state;
    renderTop();
  },
  onHello(data) {
    view.hud = data.state;
    view.events = data.history.slice(-EVENTS_KEPT);
    realm?.seed(view.events);
    settings.setServer(data.config); // -> applyConfig: state, accent, language, quality
    renderLog();
    settings.retry();
  },
  onConfig(data) {
    settings.setServer(data.config);
  },
  // The state changed without a hook event (e.g. the context size read from the transcript).
  onState(data) {
    view.hud = data.state;
    realm?.setState(view.hud, cfg());
    renderLive();
  },
  onEvent(data) {
    const before = view.hud?.stats?.level;
    view.hud = data.state;
    const after = view.hud?.stats?.level;
    if (before && after > before) levelUp(after);
    realm?.onEvent(data.event);
    realm?.setState(view.hud, cfg());
    appendLog(data.event);
    renderLive();
  },
});

/** The XP of finished tool calls crossed a level: a short celebration in the HUD and the scene. */
function levelUp(level) {
  const banner = $('levelup');
  $('levelup-n').textContent = `${t('lvl')} ${level}`;
  banner.hidden = false;
  banner.classList.remove('play');
  void banner.offsetWidth; // restart the animation
  banner.classList.add('play');
  $('lvl-badge').classList.remove('pulse');
  void $('lvl-badge').offsetWidth;
  $('lvl-badge').classList.add('pulse');
  realm?.levelUp();
  clearTimeout(levelUp.timer);
  levelUp.timer = setTimeout(() => { banner.hidden = true; }, 3600);
}

// Session timer and the header's "since": real elapsed time; paused while the tab is hidden.
setInterval(() => {
  if (!document.hidden && view.hud?.focus && view.hud.focus.endedAt === null) {
    renderTime();
    $('status-text').textContent = statusText(view.hud.focus);
  }
}, 1000);
