// Settings: optional `config.json` in the repo root (gitignored); `config.example.json` lists every key.
// Missing or invalid values fall back to DEFAULTS. Env AGENT_OFFICE_PORT overrides the port
// (the hook script reads the port the same way: env, then config.json, then 7847).

import fs from 'node:fs';

export const LANGUAGES = ['en', 'tr'];

export const DEFAULTS = Object.freeze({
  language: 'en',
  agentName: 'Claude',
  realmTitle: '', // empty = "agent-office-3d"
  realmSubtitle: '', // empty = project folder name of the current session
  port: 7847,
  contextBarMax: 150, // tool calls since the last compaction that fill the context bar
  sessionBarMinutes: 120, // session length that fills the time bar
  bloom: true, // glow post-processing in the 3D scene (off = faster on weak GPUs)
  pixelRatioCap: 1.5, // max device pixel ratio the 3D scene renders at
});

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
  sessionBarMinutes: int(5, 24 * 60),
  bloom: bool,
  pixelRatioCap: num(0.5, 3),
};

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
        const v = typeof value === 'string' ? value.trim() : value;
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
