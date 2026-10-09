import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, toolKind } from '../server/normalize.js';

const meta = { receivedAt: 1000, hookTs: 900 };
const base = {
  session_id: 'abc123',
  cwd: 'C:\\Users\\me\\proj',
  permission_mode: 'default',
  effort: { level: 'high' },
};

test('ignores unknown or malformed input', () => {
  assert.equal(normalize(null, meta), null);
  assert.equal(normalize({ hook_event_name: 'Notification' }, meta), null);
  assert.equal(normalize({}, meta), null);
});

test('PreToolUse Read keeps file name and relative path, not contents', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_use_id: 'toolu_1',
    tool_input: { file_path: 'c:\\Users\\me\\proj\\src\\auth.js' },
  }, meta);
  assert.equal(e.event, 'PreToolUse');
  assert.equal(e.kind, 'read');
  assert.equal(e.target, 'auth.js');
  assert.equal(e.path, 'src/auth.js');
  assert.equal(e.project, 'proj');
  assert.equal(e.effort, 'high');
  assert.equal(e.hookTs, 900);
});

test('PostToolUse drops tool_response but keeps duration', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/x.txt', content: 'secret file body' },
    tool_response: { filePath: '/tmp/x.txt', type: 'create' },
    tool_use_id: 'toolu_2',
    duration_ms: 12,
  }, meta);
  assert.equal(e.durationMs, 12);
  assert.equal(e.kind, 'edit');
  assert.ok(!JSON.stringify(e).includes('secret file body'));
  assert.equal(e.tool_response, undefined);
});

test('PostToolUseFailure keeps a one-line error, type and interrupt flag', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_use_id: 'toolu_3',
    error: 'Command failed with exit code 1\nnpm ERR! details',
    is_interrupt: false,
    duration_ms: 5234,
    tool_error: { type: 'execution_error', message: 'npm ERR! Test suite failed' },
  }, meta);
  assert.equal(e.kind, 'shell');
  assert.equal(e.toolUseId, 'toolu_3');
  assert.equal(e.error, 'Command failed with exit code 1');
  assert.equal(e.errorType, 'execution_error');
  assert.equal(e.durationMs, 5234);
  assert.equal(e.interrupted, undefined);
  const stopped = normalize({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Read', is_interrupt: true }, meta);
  assert.equal(stopped.interrupted, true);
});

test('Bash command is reduced to its first line and truncated', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: `\n  npm   test\nsecond line ${'x'.repeat(400)}` },
  }, meta);
  assert.equal(e.kind, 'shell');
  assert.equal(e.target, 'npm test');
});

test('WebFetch shows only the host', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PermissionRequest',
    tool_name: 'WebFetch',
    tool_input: { url: 'https://code.claude.com/docs/en/hooks?x=1' },
  }, meta);
  assert.equal(e.target, 'code.claude.com');
  assert.equal(e.kind, 'web');
});

test('event-specific fields', () => {
  assert.equal(normalize({ ...base, hook_event_name: 'SessionEnd', reason: 'clear' }, meta).reason, 'clear');
  assert.equal(normalize({ ...base, hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null }, meta).trigger, 'auto');
  const fail = normalize({ ...base, hook_event_name: 'StopFailure', error: 'rate_limit', error_details: '429 Too Many Requests' }, meta);
  assert.deepEqual([fail.error, fail.errorDetails], ['rate_limit', '429 Too Many Requests']);
  const sub = normalize({ ...base, hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: 'Explore' }, meta);
  assert.deepEqual([sub.agentId, sub.agentType], ['agent-1', 'Explore']);
  const stop = normalize({ ...base, hook_event_name: 'Stop', last_assistant_message: 'long text' }, meta);
  assert.ok(!JSON.stringify(stop).includes('long text'));
});

test('prompt preview is one line, max 120 chars, Turkish text intact', () => {
  const prompt = `Şu dosyayı düzelt ığüöç\n${'a'.repeat(300)}`;
  const e = normalize({ ...base, hook_event_name: 'UserPromptSubmit', prompt }, meta);
  assert.equal(e.promptPreview, 'Şu dosyayı düzelt ığüöç');
  const long = normalize({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'b'.repeat(300) }, meta);
  assert.equal(long.promptPreview.length, 120);
});

test('missing hook timestamp falls back to receive time', () => {
  const e = normalize({ ...base, hook_event_name: 'Stop' }, { receivedAt: 5000, hookTs: NaN });
  assert.equal(e.hookTs, 5000);
});

test('tool kinds', () => {
  assert.equal(toolKind('Glob'), 'search');
  assert.equal(toolKind('PowerShell'), 'shell');
  assert.equal(toolKind('mcp__github__create_issue'), 'mcp');
  assert.equal(toolKind('Skill'), 'other');
});

test('TodoWrite sends task counts only, never the task text', () => {
  const e = normalize({
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'TodoWrite',
    tool_input: { todos: [
      { content: 'secret plan A', status: 'completed' },
      { content: 'secret plan B', status: 'in_progress' },
      { content: 'secret plan C', status: 'pending' },
    ] },
  }, meta);
  assert.equal(e.kind, 'task');
  assert.deepEqual(e.todos, { total: 3, done: 1, doing: 1 });
  assert.ok(!JSON.stringify(e).includes('secret'));
});
