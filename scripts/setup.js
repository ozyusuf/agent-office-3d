// agent-office-3d installer core: adds the hook to Claude Code's user settings, or takes it out.
//
//   node scripts/setup.js install   [--yes] [--settings <file>]
//   node scripts/setup.js uninstall [--yes] [--settings <file>]
//   node scripts/setup.js status    [--settings <file>]
//
// install.ps1 / uninstall.ps1 call this. Rules (CLAUDE.md, D58): show the exact change as a diff,
// change nothing without a "y", back the file up before every write, keep every other setting.
// --settings points at another file (tests); the default is the user settings file of Claude Code:
// %CLAUDE_CONFIG_DIR%\settings.json, else ~/.claude/settings.json.
// Exit codes: 0 done (or nothing to do), 1 error, 2 cancelled by the user.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { HOOK_EVENTS, addHooks, removeHooks, otherCopies, detectStyle, formatSettings, lineDiff } from './hooks-config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'hooks', 'send-event.ps1');
const DATA_DIR = path.resolve(ROOT, process.env.AGENT_OFFICE_DATA || 'data');
const STATE_FILE = path.join(DATA_DIR, 'install.json');
const BOM = '﻿';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = paint('32');
const red = paint('31');
const dim = paint('2');
const bold = paint('1');
const yellow = paint('33');

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const samePath = (a, b) => typeof a === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function parseArgs(argv) {
  const opts = { command: null, yes: false, settings: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--settings') opts.settings = argv[++i];
    else if (!opts.command && !arg.startsWith('-')) opts.command = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (opts.settings === undefined) throw new Error('--settings needs a file path');
  return opts;
}

function defaultSettingsFile() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

function readSettings(file) {
  if (!exists(file)) return { exists: false, text: '', settings: {} };
  const text = fs.readFileSync(file, 'utf8');
  const clean = text.replace(/^﻿/, '');
  if (clean.trim() === '') return { exists: true, text, settings: {} };
  try {
    return { exists: true, text, settings: JSON.parse(clean) };
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). Fix it first; nothing was changed.`);
  }
}

// Writes the new text the way the file was written: same indent, line ends, final newline, BOM.
function render(settings, oldText) {
  const bom = oldText.startsWith(BOM) ? BOM : '';
  return bom + formatSettings(settings, detectStyle(oldText.replace(/^﻿/, '')));
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backup(file, label) {
  let target = `${file}.agent-office-3d-${label}${stamp()}.bak`;
  for (let n = 2; exists(target); n++) target = `${file}.agent-office-3d-${label}${stamp()}-${n}.bak`;
  fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  return target;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Temp file + rename, so Claude Code never reads a half-written file.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.agent-office-3d.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      // Windows refuses the rename while another program has the file open for a moment.
      if (attempt >= 10 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      sleep(100);
    }
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function clearState() {
  fs.rmSync(STATE_FILE, { force: true });
}

function printDiff(beforeText, afterText) {
  const lines = lineDiff(beforeText.replace(/^﻿/, ''), afterText.replace(/^﻿/, ''));
  for (const { op, text } of lines) {
    if (op === '+') console.log(green(`+ ${text}`));
    else if (op === '-') console.log(red(`- ${text}`));
    else console.log(dim(`  ${text}`));
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.on('close', () => {
      if (!answered) {
        console.log('');
        resolve(false); // no answer (input closed) = no
      }
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}

async function confirm(question, opts) {
  if (opts.yes) {
    console.log(`${question}y (--yes)`);
    return true;
  }
  return ask(question);
}

function header(file) {
  console.log(bold('Claude Code user settings: ') + file + (process.env.CLAUDE_CONFIG_DIR ? dim(' (from CLAUDE_CONFIG_DIR)') : ''));
  console.log(bold('Hook script:                ') + SCRIPT);
  console.log('');
}

async function install(opts) {
  const file = opts.settings ?? defaultSettingsFile();
  header(file);
  if (!exists(SCRIPT)) throw new Error(`hook script not found: ${SCRIPT}`);
  const cur = readSettings(file);
  const { settings: next, added, stale } = addHooks(cur.settings, SCRIPT, { exists });
  if (cur.settings.disableAllHooks === true) {
    console.log(yellow('Note: "disableAllHooks" is true in this file, so no hook runs until you set it to false.'));
  }
  for (const other of otherCopies(next, SCRIPT)) {
    console.log(yellow(`Note: another agent-office-3d hook is registered too and stays: ${other}`));
  }
  if (added === 0 && stale === 0) {
    console.log(green(`Already installed: all ${HOOK_EVENTS.length} events run the hook script. Nothing to change.`));
    return 0;
  }

  const nextText = render(next, cur.text);
  console.log(bold(cur.exists ? `Planned change to ${file}:` : `Planned new file ${file}:`));
  printDiff(cur.text, nextText);
  console.log('');
  console.log(bold('In short:'));
  if (added) console.log(`  - adds one async hook to ${added} event(s): ${HOOK_EVENTS.join(', ')}`);
  if (stale) console.log(`  - removes ${stale} old agent-office-3d hook(s) whose script no longer exists`);
  console.log('  - keeps every other setting and hook in the file as it is');
  console.log(cur.exists ? '  - saves a copy of the current file first (next to it, ending in .bak)' : '  - the file does not exist yet, so it is created');
  console.log('');
  if (!(await confirm('Apply this change? Type y and press Enter (anything else cancels): ', opts))) {
    console.log('Cancelled. Nothing was changed.');
    return 2;
  }

  const prev = readState();
  const backupFile = cur.exists ? backup(file, '') : null;
  writeAtomic(file, nextText);
  // Check what landed on disk before saying it worked.
  const check = readSettings(file);
  if (addHooks(check.settings, SCRIPT, { exists }).added !== 0) throw new Error(`the hooks are not in ${file} after writing it`);

  // Uninstall restores the copy taken before the first install, as long as nobody changed the file
  // since. A re-install over our own unchanged file keeps pointing at that first copy.
  const keepPrev = prev && samePath(prev.settingsFile, file) && cur.exists && sha256(cur.text) === prev.writtenSha256;
  writeState({
    settingsFile: file,
    existedBefore: keepPrev ? prev.existedBefore : cur.exists,
    backupFile: keepPrev ? prev.backupFile : backupFile,
    writtenSha256: sha256(nextText),
    installedAt: new Date().toISOString(),
  });
  if (backupFile) console.log(`Backup: ${backupFile}`);
  console.log(green(`Installed. ${file} now runs the hook on ${HOOK_EVENTS.length} events.`));
  console.log('Claude Code picks up hook changes by itself; restart a session that was already open if its events do not show up.');
  return 0;
}

async function uninstall(opts) {
  const file = opts.settings ?? defaultSettingsFile();
  header(file);
  const cur = readSettings(file);
  if (!cur.exists) {
    console.log(`${file} does not exist. Nothing to remove.`);
    clearState();
    return 0;
  }
  const state = readState();
  const { settings: next, removed } = removeHooks(cur.settings, SCRIPT, { exists });

  // Untouched since the installer wrote it: put back exactly what was there before.
  let plan = null;
  if (state && samePath(state.settingsFile, file) && sha256(cur.text) === state.writtenSha256) {
    if (!state.existedBefore) {
      plan = { kind: 'delete', text: '' };
    } else if (state.backupFile && exists(state.backupFile)) {
      const saved = readSettings(state.backupFile);
      if (removeHooks(saved.settings, SCRIPT, { exists }).removed === 0) plan = { kind: 'restore', text: saved.text, from: state.backupFile };
    }
  }
  if (!plan) {
    if (removed === 0) {
      console.log(`No agent-office-3d hook in ${file}. Nothing to change.`);
      clearState();
      return 0;
    }
    plan = { kind: 'remove', text: render(next, cur.text) };
  }

  console.log(bold(`Planned change to ${file}:`));
  printDiff(cur.text, plan.text);
  console.log('');
  console.log(bold('In short:'));
  if (plan.kind === 'restore') {
    console.log('  - the file has not changed since the installer wrote it, so it goes back to the copy saved');
    console.log(`    before installing: ${plan.from}`);
  } else if (plan.kind === 'delete') {
    console.log('  - the installer created this file and it holds nothing else, so it is deleted');
  } else {
    console.log(`  - removes agent-office-3d's hook from ${removed} place(s); every other setting stays as it is`);
  }
  console.log('  - saves a copy of the current file first (next to it, ending in .bak)');
  console.log('');
  if (!(await confirm('Apply this change? Type y and press Enter (anything else cancels): ', opts))) {
    console.log('Cancelled. Nothing was changed.');
    return 2;
  }

  const backupFile = backup(file, 'uninstall-');
  if (plan.kind === 'delete') fs.rmSync(file);
  else writeAtomic(file, plan.text);
  clearState();
  console.log(`Backup: ${backupFile}`);
  console.log(green('Removed. agent-office-3d no longer runs from your Claude Code user settings.'));
  return 0;
}

function status(opts) {
  const file = opts.settings ?? defaultSettingsFile();
  header(file);
  const cur = readSettings(file);
  const { added, stale } = addHooks(cur.settings, SCRIPT, { exists });
  const installed = HOOK_EVENTS.length - added;
  console.log(`${installed} of ${HOOK_EVENTS.length} events run this hook script${stale ? `; ${stale} stale hook(s) from a moved clone` : ''}.`);
  for (const other of otherCopies(cur.settings, SCRIPT)) console.log(`Another agent-office-3d hook: ${other}`);
  const state = readState();
  if (state?.backupFile) console.log(`Backup from the install: ${state.backupFile}`);
  return installed === HOOK_EVENTS.length ? 0 : 3;
}

const commands = { install, uninstall, status };

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  const run = commands[opts.command];
  if (!run) {
    console.log('Usage: node scripts/setup.js install|uninstall|status [--yes] [--settings <file>]');
    return opts.command ? 1 : 0;
  }
  try {
    return await run(opts);
  } catch (err) {
    console.error(red(`Error: ${err.message}`));
    return 1;
  }
}

process.exitCode = await main();
