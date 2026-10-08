// Turns a raw Claude Code hook input (https://code.claude.com/docs/en/hooks) into a small
// display event. Only what the screen needs leaves the server: no file contents, no tool output,
// no assistant messages (docs/DECISIONS.md D7).

export const HOOK_EVENTS = new Set([
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'PreCompact',
  'PostCompact', 'Stop', 'StopFailure',
]);

// Tool name -> station/skill kind (docs/DESIGN.md section 5).
const TOOL_KINDS = {
  Read: 'read',
  Grep: 'search', Glob: 'search',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'shell', PowerShell: 'shell',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Task: 'agent',
  TodoWrite: 'task', TaskCreate: 'task', TaskUpdate: 'task', TaskList: 'task', TaskGet: 'task',
};

const MAX_TEXT = 160;
const PROMPT_PREVIEW = 120;

export function toolKind(tool) {
  if (!tool) return null;
  if (TOOL_KINDS[tool]) return TOOL_KINDS[tool];
  if (tool.startsWith('mcp__')) return 'mcp';
  return 'other';
}

/**
 * @param {object} raw  parsed hook input JSON
 * @param {{receivedAt: number, hookTs?: number}} meta
 * @returns {object|null} display event, or null if this is not a hook event we handle
 */
export function normalize(raw, { receivedAt, hookTs }) {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw.hook_event_name;
  if (!HOOK_EVENTS.has(event)) return null;

  const cwd = str(raw.cwd);
  const out = {
    event,
    receivedAt,
    hookTs: Number.isFinite(hookTs) && hookTs > 0 ? hookTs : receivedAt,
    sessionId: str(raw.session_id),
    cwd,
    project: baseName(cwd),
    agentId: str(raw.agent_id),
    agentType: str(raw.agent_type),
    permissionMode: str(raw.permission_mode),
    effort: str(raw.effort?.level),
  };

  if (raw.tool_name) {
    const tool = str(raw.tool_name);
    Object.assign(out, { tool, kind: toolKind(tool), toolUseId: str(raw.tool_use_id) });
    Object.assign(out, describeTool(tool, raw.tool_input ?? {}, cwd));
  }

  switch (event) {
    case 'SessionStart':
      Object.assign(out, { source: str(raw.source), model: str(raw.model) });
      if (Number.isFinite(raw.context_tokens)) out.contextTokens = raw.context_tokens;
      break;
    case 'SessionEnd':
      out.reason = str(raw.reason);
      break;
    case 'UserPromptSubmit':
      out.promptPreview = oneLine(raw.prompt, PROMPT_PREVIEW);
      break;
    case 'PostToolUse':
      if (Number.isFinite(raw.duration_ms)) out.durationMs = raw.duration_ms;
      break;
    case 'PostToolUseFailure':
      // Fires instead of PostToolUse when a tool errors or is interrupted.
      if (Number.isFinite(raw.duration_ms)) out.durationMs = raw.duration_ms;
      Object.assign(out, {
        error: oneLine(raw.error, MAX_TEXT),
        errorType: str(raw.tool_error?.type),
        interrupted: raw.is_interrupt === true || undefined,
      });
      break;
    case 'PreCompact':
    case 'PostCompact':
      out.trigger = str(raw.trigger);
      break;
    case 'StopFailure':
      Object.assign(out, { error: str(raw.error), errorDetails: oneLine(raw.error_details, MAX_TEXT) });
      break;
  }

  return dropEmpty(out);
}

// Short, human-sized description of what a tool call is about.
function describeTool(tool, input, cwd) {
  const filePath = str(input.file_path) || str(input.notebook_path);
  if (filePath) return { target: baseName(filePath), path: relativeTo(filePath, cwd) };

  switch (tool) {
    case 'Grep':
    case 'Glob':
      return { target: oneLine(input.pattern, MAX_TEXT) };
    case 'Bash':
    case 'PowerShell':
      return { target: oneLine(input.command, MAX_TEXT) };
    case 'WebFetch':
      return { target: urlHost(input.url) };
    case 'WebSearch':
      return { target: oneLine(input.query, MAX_TEXT) };
    case 'Agent':
    case 'Task':
      return { target: oneLine(input.description || input.subagent_type, MAX_TEXT) };
    case 'TodoWrite':
      return Array.isArray(input.todos) ? { target: `${input.todos.length} todos` } : {};
    case 'Skill':
      return { target: oneLine(input.skill || input.command, MAX_TEXT) };
  }
  if (tool.startsWith('mcp__')) return { target: tool.split('__').slice(1).join(' / ') };
  return {};
}

function str(value) {
  return typeof value === 'string' && value.length ? value : undefined;
}

function oneLine(value, max) {
  if (typeof value !== 'string') return undefined;
  const line = value.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const text = line.trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function baseName(p) {
  if (!p) return undefined;
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || undefined;
}

// Path relative to the session cwd when the file is inside it (case-insensitive for Windows).
function relativeTo(filePath, cwd) {
  const file = filePath.replace(/\\/g, '/');
  if (!cwd) return file;
  const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
  return file.toLowerCase().startsWith(root.toLowerCase()) ? file.slice(root.length) : file;
}

function urlHost(url) {
  if (typeof url !== 'string') return undefined;
  try {
    return new URL(url).host;
  } catch {
    return oneLine(url, MAX_TEXT);
  }
}

function dropEmpty(obj) {
  for (const key of Object.keys(obj)) if (obj[key] === undefined) delete obj[key];
  return obj;
}
