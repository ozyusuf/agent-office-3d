// Pure helpers for the installer: add or remove agent-office-3d's hook in a Claude Code settings
// object, keep the file's formatting, and show a line diff. No file access here (see setup.js).

// The 13 hooked events (CLAUDE.md). test/setup.test.js checks this list against .claude/settings.json.
export const HOOK_EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact', 'Stop', 'StopFailure',
];

// Same exec form as the project settings (D2), with the script's absolute path instead of
// ${CLAUDE_PROJECT_DIR}, because user settings apply to every project.
export function hookHandler(scriptPath) {
  return {
    type: 'command',
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    async: true,
  };
}

const SCRIPT_TAIL = '\\hooks\\send-event.ps1';
const norm = (p) => p.replace(/\//g, '\\').toLowerCase();

function handlerPaths(handler) {
  if (!handler || typeof handler !== 'object') return [];
  const parts = Array.isArray(handler.args) ? handler.args.filter((a) => typeof a === 'string') : [];
  if (typeof handler.command === 'string') parts.push(handler.command);
  return parts;
}

// Ours: any handler that runs this clone's hook script.
export function isOurs(handler, scriptPath) {
  const target = norm(scriptPath);
  return handlerPaths(handler).some((part) => norm(part).includes(target));
}

// Stale: a handler that runs an agent-office-3d hook script that no longer exists (an old clone
// that was moved or deleted). It cannot work any more, so the installer replaces it.
export function isStale(handler, exists) {
  return handlerPaths(handler).some((part) => {
    const p = norm(part);
    return p.endsWith(SCRIPT_TAIL) && /^[a-z]:\\/.test(p) && !exists(part);
  });
}

function sameHandler(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkShape(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('the settings file does not contain a JSON object');
  }
  const hooks = settings.hooks;
  if (hooks === undefined) return;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error('"hooks" is not an object');
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) throw new Error(`"hooks.${event}" is not a list`);
    for (const group of groups) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
        throw new Error(`"hooks.${event}" has an entry without a "hooks" list`);
      }
    }
  }
}

// Removes every handler that matches `drop` (and any group left empty by that), in place.
function strip(settings, drop) {
  let removed = 0;
  const hooks = settings.hooks;
  if (!hooks) return removed;
  for (const event of Object.keys(hooks)) {
    hooks[event] = hooks[event].filter((group) => {
      const before = group.hooks.length;
      group.hooks = group.hooks.filter((h) => !drop(h));
      removed += before - group.hooks.length;
      return group.hooks.length > 0 || before === 0;
    });
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return removed;
}

// Returns a new settings object with exactly one agent-office-3d handler per hooked event.
// An event that already has exactly that handler keeps it where it is; other hooks are untouched.
export function addHooks(settings, scriptPath, { exists = () => true } = {}) {
  checkShape(settings);
  const out = structuredClone(settings);
  const wanted = hookHandler(scriptPath);
  const stale = strip(out, (h) => !isOurs(h, scriptPath) && isStale(h, exists));
  let added = 0;
  let kept = 0;
  for (const event of HOOK_EVENTS) {
    const groups = out.hooks?.[event] ?? [];
    const ours = groups.flatMap((g) => g.hooks.filter((h) => isOurs(h, scriptPath)));
    if (ours.length === 1 && sameHandler(ours[0], wanted)) {
      kept++;
      continue;
    }
    if (ours.length) {
      out.hooks[event] = groups
        .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isOurs(h, scriptPath)) }))
        .filter((g, k) => g.hooks.length > 0 || groups[k].hooks.length === 0);
    }
    out.hooks ??= {};
    out.hooks[event] ??= [];
    out.hooks[event].push({ hooks: [{ ...wanted, args: [...wanted.args] }] });
    added++;
  }
  return { settings: out, added, kept, stale };
}

// Returns a new settings object without any agent-office-3d handler of this clone (or a stale one).
export function removeHooks(settings, scriptPath, { exists = () => true } = {}) {
  checkShape(settings);
  const out = structuredClone(settings);
  const removed = strip(out, (h) => isOurs(h, scriptPath) || isStale(h, exists));
  return { settings: out, removed };
}

// Other handlers that look like agent-office-3d hooks from another clone that still exists.
export function otherCopies(settings, scriptPath) {
  const found = new Set();
  for (const groups of Object.values(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      for (const h of group?.hooks ?? []) {
        if (isOurs(h, scriptPath)) continue;
        for (const part of handlerPaths(h)) if (norm(part).endsWith(SCRIPT_TAIL)) found.add(part);
      }
    }
  }
  return [...found];
}

// ---- Formatting: write the file back the way it was written ----

export function detectStyle(text) {
  const indent = /^[{[][^\n]*\n([ \t]+)\S/.exec(text)?.[1] ?? '  ';
  return { indent, eol: text.includes('\r\n') ? '\r\n' : '\n', finalNewline: text === '' || /\n$/.test(text) };
}

export function formatSettings(settings, style = detectStyle('')) {
  const body = JSON.stringify(settings, null, style.indent).replace(/\n/g, style.eol);
  return style.finalNewline ? body + style.eol : body;
}

// ---- Line diff (LCS) with a little context, for showing the change before it is made ----

export function lineDiff(beforeText, afterText, context = 2) {
  const a = beforeText === '' ? [] : beforeText.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const b = afterText === '' ? [] : afterText.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  // Trim the common head and tail so the table stays small for big files.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const ops = [];
  for (let i = 0; i < head; i++) ops.push([' ', a[i]]);
  if (x.length * y.length > 4e6) {
    for (const line of x) ops.push(['-', line]);
    for (const line of y) ops.push(['+', line]);
  } else {
    const n = x.length;
    const m = y.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) {
        ops.push([' ', x[i++]]);
        j++;
      } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
        ops.push(['-', x[i++]]);
      } else {
        ops.push(['+', y[j++]]);
      }
    }
  }
  for (let i = a.length - tail; i < a.length; i++) ops.push([' ', a[i]]);

  // Keep changed lines plus `context` lines around them; mark skipped stretches with "...".
  const keep = ops.map(() => false);
  ops.forEach(([op], k) => {
    if (op === ' ') return;
    for (let d = -context; d <= context; d++) if (ops[k + d]) keep[k + d] = true;
  });
  const lines = [];
  let skipped = false;
  ops.forEach(([op, text], k) => {
    if (!keep[k]) {
      skipped = true;
      return;
    }
    if (skipped && lines.length) lines.push({ op: '.', text: '...' });
    skipped = false;
    lines.push({ op, text });
  });
  return lines;
}
