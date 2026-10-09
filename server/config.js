// Settings: optional `config.json` in the repo root (gitignored); `config.example.json` lists every key.
// Missing or invalid values fall back to DEFAULTS. Env AGENT_OFFICE_PORT overrides the port
// (the hook script reads the port the same way: env, then config.json, then 7847).
// The HUD's settings panel changes every key except the port through `POST /config` (server/index.js).

import fs from 'node:fs';

export const LANGUAGES = ['en', 'tr'];

export const DEFAULTS = Object.freeze({
  language: 'en',
  agentName: 'Claude',
  realmTitle: '', // empty = "agent-office-3d"
  realmSubtitle: '', // empty = project folder name of the current session
  port: 7847,
  contextBarMax: 150, // fallback: tool calls since the last compaction that fill the context bar
  contextWindow: 'auto', // tokens that fill the context bar: 'auto' (200k, or 1M once more is used) or a number
  sessionBarMinutes: 120, // session length that fills the time bar
  bloom: true, // glow post-processing in the 3D scene (off = faster on weak GPUs)
  pixelRatioCap: 1.5, // max device pixel ratio the 3D scene renders at
  maxFps: 60, // most frames per second the 3D scene draws (it draws fewer while calm, D67)
  accentColor: '#33b7de', // replaces the neon cyan in the HUD and the 3D scene (default = measured cyan)
  sky: 'clock', // the realm's sky: follows the local time, or stays at dawn / day / dusk / night
});

export const SKIES = ['clock', 'dawn', 'day', 'dusk', 'night'];

/** Keys the settings panel may change. Not the port: the hook script and the server read it at start. */
export const EDITABLE = Object.freeze(Object.keys(DEFAULTS).filter((key) => key !== 'port'));

const text = (max) => (v) => typeof v === 'string' && v.length <= max;
const int = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const num = (min, max) => (v) => typeof v === 'number' && v >= min && v <= max;
const bool = (v) => typeof v === 'boolean';

const RULES = {
  language: (v) => LANGUAGES.includes(v),
  agentName: text(40),
  realmTitle: text(48),
  realmSubtitle: text(48),
  port: int(1024, 65535),
  contextBarMax: int(10, 100000),
  contextWindow: (v) => v === 'auto' || int(10000, 10000000)(v),
  sessionBarMinutes: int(5, 24 * 60),
  bloom: bool,
  pixelRatioCap: num(0.5, 3),
  maxFps: (v) => v === 30 || v === 60,
  accentColor: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v),
  sky: (v) => SKIES.includes(v),
};

/** Trims strings; colours are stored in lower case. */
function clean(key, value) {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return key === 'accentColor' ? v.toLowerCase() : v;
}

/**
 * @param {unknown} raw  parsed config.json, or undefined when there is no file
 * @param {Record<string, string|undefined>} env
 * @returns {{config: typeof DEFAULTS, warnings: string[]}}
 */
export function parseConfig(raw, env = {}) {
  const config = { ...DEFAULTS };
  const warnings = [];
  if (raw !== undefined) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      warnings.push('config.json must contain a JSON object; using defaults');
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (!(key in RULES)) {
          warnings.push(`config.json: unknown key "${key}" ignored`);
          continue;
        }
        const v = clean(key, value);
        if (RULES[key](v)) config[key] = v;
        else warnings.push(`config.json: invalid ${key} ${JSON.stringify(value)}, using ${JSON.stringify(DEFAULTS[key])}`);
      }
    }
  }
  if (env.AGENT_OFFICE_PORT) {
    const port = Number(env.AGENT_OFFICE_PORT);
    if (RULES.port(port)) config.port = port;
    else warnings.push(`AGENT_OFFICE_PORT=${env.AGENT_OFFICE_PORT} is not a valid port, using ${config.port}`);
  }
  return { config, warnings };
}

export function loadConfig(file, env = process.env) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      const result = parseConfig(undefined, env);
      result.warnings.unshift(`could not read ${file}: ${err.message}; using defaults`);
      return result;
    }
  }
  return parseConfig(raw, env);
}

/**
 * Checks a settings-panel update. Unlike config.json, nothing falls back silently: every key must be
 * editable and valid, or the whole update is refused.
 * @returns {{ values: Record<string, unknown>, errors: { key: string|null, message: string }[] }}
 */
export function checkUpdate(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { values: {}, errors: [{ key: null, message: 'the body must be a JSON object' }] };
  }
  const values = {};
  const errors = [];
  for (const [key, value] of Object.entries(patch)) {
    const v = clean(key, value);
    if (!EDITABLE.includes(key)) errors.push({ key, message: 'not a setting that can be changed here' });
    else if (!RULES[key](v)) errors.push({ key, message: `invalid value ${JSON.stringify(value)}` });
    else values[key] = v;
  }
  if (!errors.length && !Object.keys(values).length) errors.push({ key: null, message: 'nothing to change' });
  return { values, errors };
}

/**
 * Writes checked `values` into the config file and keeps every other key it has (e.g. the port).
 * Atomic (temp file + rename). A file that is not a JSON object is moved aside, never overwritten.
 * @returns {{ config: typeof DEFAULTS, warnings: string[] }}  the config the file now gives
 */
export function saveConfig(file, values, env = process.env) {
  let raw = {};
  const warnings = [];
  let text = null;
  try {
    text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (text !== null) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // handled below
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed;
    } else {
      const kept = `${file}.unreadable-${Date.now()}`;
      fs.renameSync(file, kept);
      warnings.push(`${file} was not a JSON object; moved to ${kept}`);
    }
  }
  const next = { ...raw, ...values };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  const result = parseConfig(next, env);
  result.warnings.unshift(...warnings);
  return result;
}
