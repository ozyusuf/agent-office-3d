// Turns display events and session state into human sentences (via i18n templates).
// Pure functions: no DOM, so they run in node:test too.

/** Hook Flow line for one event, or null for events that do not get a line (PostToolUse). */
export function logEntry(e, t) {
  const tool = e.tool;
  switch (e.event) {
    case 'SessionStart':
      return { tone: 'session', parts: t.parts('log.sessionStart', { source: t.word('source', e.source) }) };
    case 'UserPromptSubmit':
      return { tone: 'prompt', parts: t.parts('log.prompt') };
    case 'PreToolUse':
      return { tone: 'tool', parts: t.parts(toolLogKey(e), { target: e.target, tool }) };
    case 'PostToolUse':
      return null; // the HUD shows it as a skill dimming; the log stays readable
    case 'PostToolUseFailure':
      return e.interrupted
        ? { tone: 'fail', parts: t.parts('log.interrupted', { tool }) }
        : { tone: 'fail', parts: t.parts('log.toolFailed', { tool, error: e.error }) };
    case 'PermissionRequest':
      return { tone: 'warn', parts: t.parts('log.permission', { tool, target: e.target }) };
    case 'SubagentStart':
      return { tone: 'helper', parts: t.parts('log.helperStart', { type: e.agentType }) };
    case 'SubagentStop':
      return { tone: 'helper', parts: t.parts('log.helperStop', { type: e.agentType }) };
    case 'PreCompact':
      return { tone: 'compact', parts: t.parts('log.preCompact', { trigger: t.word('trigger', e.trigger) }) };
    case 'PostCompact':
      return { tone: 'compact', parts: t.parts('log.postCompact') };
    case 'Stop':
      return { tone: 'stop', parts: t.parts('log.stop') };
    case 'StopFailure':
      return { tone: 'fail', parts: t.parts('log.stopFailure', { error: t.word('error', e.error) }) };
    case 'SessionEnd':
      return { tone: 'session', parts: t.parts('log.sessionEnd', { reason: t.word('reason', e.reason) }) };
    default:
      return null;
  }
}

function toolLogKey(e) {
  if (e.tool === 'WebSearch') return 'log.webSearch';
  if (e.tool === 'WebFetch') return 'log.webFetch';
  if (e.tool === 'Write') return 'log.write';
  const known = ['read', 'search', 'edit', 'shell', 'task', 'agent'];
  return known.includes(e.kind) ? `log.${e.kind}` : 'log.other';
}

/** "What is the agent doing" text for the character label, from the server's focus session. */
export function activityParts(focus, t) {
  if (!focus) return t.parts('act.none');
  switch (focus.status) {
    case 'ended':
      return t.parts('act.ended');
    case 'error':
      return t.parts('act.error', { error: t.word('error', focus.error?.error) });
    case 'waiting':
      return t.parts('act.waiting', { tool: focus.permission?.tool });
  }
  if (focus.compacting) return t.parts('act.compacting');
  const a = focus.activity;
  if (a) {
    const known = ['read', 'search', 'edit', 'shell', 'web', 'task', 'agent'];
    return t.parts(known.includes(a.kind) ? `act.${a.kind}` : 'act.other', { target: a.target, tool: a.tool });
  }
  return t.parts(focus.status === 'working' ? 'act.thinking' : 'act.idle');
}

/** 75 s -> "1m 15s", 2 h 5 min -> "2h 05m" (units translated). */
export function formatDuration(ms, t) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}${t('unit.h')} ${pad(m)}${t('unit.m')}`;
  if (m > 0) return `${m}${t('unit.m')} ${pad(s)}${t('unit.s')}`;
  return `${s}${t('unit.s')}`;
}
