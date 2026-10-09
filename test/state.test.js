import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HudState, levelInfo } from '../server/state.js';

// Minimal display events, shaped like normalize.js output.
let clock = 1_000_000;
const ev = (event, extra = {}) => ({ event, sessionId: 's1', project: 'proj', hookTs: (clock += 1000), ...extra });
const pre = (tool, kind, id, extra) => ev('PreToolUse', { tool, kind, toolUseId: id, target: `${tool}-target`, ...extra });
const post = (tool, kind, id, extra) => ev('PostToolUse', { tool, kind, toolUseId: id, ...extra });

function run(events, xp = 0) {
  const hud = new HudState({ xp });
  for (const e of events) hud.apply(e);
  return { hud, focus: hud.snapshot().focus, snap: hud.snapshot() };
}

test('level curve matches DESIGN.md', () => {
  assert.deepEqual(levelInfo(0), { xp: 0, level: 1, levelXp: 0, nextLevelXp: 5, progress: 0 });
  assert.equal(levelInfo(4).level, 1);
  assert.equal(levelInfo(5).level, 2);
  assert.equal(levelInfo(19).level, 2);
  assert.equal(levelInfo(20).level, 3);
  assert.equal(levelInfo(45).level, 4);
  const l = levelInfo(12); // level 2: 5..20
  assert.equal(l.progress, (12 - 5) / 15);
  for (let xp = 0; xp < 5000; xp++) {
    const { level, levelXp, nextLevelXp } = levelInfo(xp);
    assert.ok(levelXp <= xp && xp < nextLevelXp, `xp ${xp} in level ${level}`);
  }
});

test('no events -> no focus session (HUD shows "waiting for events")', () => {
  const snap = new HudState({ xp: 7 }).snapshot();
  assert.equal(snap.focus, null);
  assert.equal(snap.stats.xp, 7);
});

test('a normal turn: start, prompt, read, stop', () => {
  const hud = new HudState();
  hud.apply(ev('SessionStart', { source: 'startup', effort: 'high' }));
  let f = hud.snapshot().focus;
  assert.equal(f.status, 'idle');
  assert.equal(f.startExact, true);
  assert.equal(f.contextExact, true);
  assert.equal(f.effort, 'high');

  hud.apply(ev('UserPromptSubmit'));
  assert.equal(hud.snapshot().focus.status, 'working');

  hud.apply(pre('Read', 'read', 't1'));
  f = hud.snapshot().focus;
  assert.deepEqual(f.activeKinds, ['read']);
  assert.equal(f.activity.target, 'Read-target');

  assert.equal(hud.apply(post('Read', 'read', 't1')), true); // XP changed
  f = hud.snapshot().focus;
  assert.deepEqual(f.activeKinds, []);
  assert.equal(f.activity, null);
  assert.equal(f.status, 'working');
  assert.equal(f.context, 1);
  assert.equal(f.toolsDone, 1);
  assert.equal(hud.snapshot().stats.xp, 1);

  hud.apply(ev('Stop'));
  assert.equal(hud.snapshot().focus.status, 'idle');
});

test('permission waits until the paired call finishes', () => {
  const { hud } = run([ev('UserPromptSubmit'), pre('Bash', 'shell', 't1'), pre('Read', 'read', 't2')]);
  hud.apply(ev('PermissionRequest', { tool: 'Bash', kind: 'shell', target: 'npm test' }));
  assert.equal(hud.snapshot().focus.status, 'waiting');
  assert.deepEqual(hud.snapshot().focus.permission, { tool: 'Bash', target: 'npm test' });
  hud.apply(post('Read', 'read', 't2')); // another call finishing does not clear it
  assert.equal(hud.snapshot().focus.status, 'waiting');
  hud.apply(post('Bash', 'shell', 't1'));
  assert.equal(hud.snapshot().focus.status, 'working');
  assert.equal(hud.snapshot().focus.permission, null);
});

test('permission that arrives before its PreToolUse is paired, not cleared', () => {
  const { hud } = run([ev('UserPromptSubmit'), ev('PermissionRequest', { tool: 'Bash', kind: 'shell' })]);
  hud.apply(pre('Bash', 'shell', 't9'));
  assert.equal(hud.snapshot().focus.status, 'waiting');
  hud.apply(post('Bash', 'shell', 't9'));
  assert.equal(hud.snapshot().focus.status, 'working');
});

test('a new prompt or Stop clears a pending permission', () => {
  const a = run([ev('UserPromptSubmit'), pre('Bash', 'shell', 't1'), ev('PermissionRequest', { tool: 'Bash' }), ev('Stop')]);
  assert.equal(a.focus.status, 'idle');
  const b = run([ev('UserPromptSubmit'), pre('Bash', 'shell', 't1'), ev('PermissionRequest', { tool: 'Bash' }), ev('UserPromptSubmit')]);
  assert.equal(b.focus.status, 'working');
  assert.equal(b.focus.permission, null);
});

test('interrupted tool ends the turn (no Stop fires on interrupt)', () => {
  const { focus, snap } = run([
    ev('UserPromptSubmit'),
    pre('Bash', 'shell', 't1'),
    ev('PostToolUseFailure', { tool: 'Bash', kind: 'shell', toolUseId: 't1', interrupted: true }),
  ]);
  assert.equal(focus.status, 'idle');
  assert.deepEqual(focus.activeKinds, []);
  assert.equal(snap.stats.xp, 1); // failed calls still count
  assert.equal(focus.context, 1);
});

test('compaction resets the context count', () => {
  const { hud } = run([ev('SessionStart', { source: 'startup' }), ev('UserPromptSubmit'), pre('Read', 'read', 'a'), post('Read', 'read', 'a'), pre('Read', 'read', 'b'), post('Read', 'read', 'b')]);
  assert.equal(hud.snapshot().focus.context, 2);
  hud.apply(ev('PreCompact', { trigger: 'auto' }));
  assert.deepEqual(hud.snapshot().focus.compacting.trigger, 'auto');
  assert.equal(hud.snapshot().focus.status, 'working');
  hud.apply(ev('PostCompact', { trigger: 'auto' }));
  const f = hud.snapshot().focus;
  assert.equal(f.context, 0);
  assert.equal(f.contextExact, true);
  assert.equal(f.compacting, null);
  assert.equal(f.toolsDone, 2); // session total is not reset by compaction
});

test('subagent calls: XP yes, main context no; activity prefers the main agent', () => {
  const { hud } = run([
    ev('SessionStart', { source: 'startup' }),
    ev('UserPromptSubmit'),
    pre('Agent', 'agent', 'm1', { target: 'explore docs' }),
    ev('SubagentStart', { agentId: 'ag1', agentType: 'Explore' }),
    pre('Grep', 'search', 'x1', { agentId: 'ag1', agentType: 'Explore' }),
  ]);
  let f = hud.snapshot().focus;
  assert.deepEqual(f.activeKinds.sort(), ['agent', 'search']);
  assert.equal(f.activity.kind, 'agent');
  assert.deepEqual(f.helpers, [{ id: 'ag1', agentType: 'Explore', kind: 'search' }]);
  hud.apply(post('Grep', 'search', 'x1', { agentId: 'ag1' }));
  f = hud.snapshot().focus;
  assert.equal(f.context, 0);
  assert.equal(hud.snapshot().stats.xp, 1);
  hud.apply(ev('SubagentStop', { agentId: 'ag1', agentType: 'Explore' }));
  hud.apply(post('Agent', 'agent', 'm1'));
  f = hud.snapshot().focus;
  assert.deepEqual(f.helpers, []);
  assert.equal(f.context, 1);
});

test('StopFailure -> error until the next prompt', () => {
  const { hud, focus } = run([ev('UserPromptSubmit'), ev('StopFailure', { error: 'rate_limit', errorDetails: '429' })]);
  assert.equal(focus.status, 'error');
  assert.deepEqual(focus.error, { error: 'rate_limit', details: '429' });
  hud.apply(ev('UserPromptSubmit'));
  assert.equal(hud.snapshot().focus.status, 'working');
  assert.equal(hud.snapshot().focus.error, null);
});

test('SessionEnd -> ended, timer stops', () => {
  const { focus } = run([ev('SessionStart', { source: 'startup' }), ev('SessionEnd', { reason: 'prompt_input_exit' })]);
  assert.equal(focus.status, 'ended');
  assert.equal(focus.endReason, 'prompt_input_exit');
  assert.ok(focus.endedAt > focus.startedAt);
  assert.equal(new HudState().snapshot().liveSessions, 0);
});

test('joining a session late marks start and context as lower bounds', () => {
  const { focus } = run([pre('Read', 'read', 't1'), post('Read', 'read', 't1')]);
  assert.equal(focus.startExact, false);
  assert.equal(focus.contextExact, false);
  assert.equal(focus.context, 1);
  assert.equal(focus.status, 'working');
});

test('resume keeps unknown context unknown; startup/clear make it exact', () => {
  assert.equal(run([ev('SessionStart', { source: 'resume' })]).focus.contextExact, false);
  assert.equal(run([ev('SessionStart', { source: 'clear' })]).focus.contextExact, true);
  const compact = run([pre('Read', 'read', 'a'), post('Read', 'read', 'a'), ev('SessionStart', { source: 'compact' })]).focus;
  assert.equal(compact.context, 0);
  assert.equal(compact.startExact, false); // compaction is not a new session start
});

test('focus follows the most recent event across sessions', () => {
  const { hud } = run([ev('SessionStart', { source: 'startup' })]);
  hud.apply({ ...ev('UserPromptSubmit'), sessionId: 's2', project: 'other' });
  let snap = hud.snapshot();
  assert.equal(snap.focus.sessionId, 's2');
  assert.equal(snap.focus.project, 'other');
  assert.equal(snap.liveSessions, 2);
  hud.apply(ev('Stop'));
  snap = hud.snapshot();
  assert.equal(snap.focus.sessionId, 's1');
});

test('Stop keeps running background subagent calls, a new prompt clears them', () => {
  const { hud } = run([ev('UserPromptSubmit'), pre('Read', 'read', 'm1'), pre('Bash', 'shell', 'x1', { agentId: 'ag1' }), ev('Stop')]);
  assert.deepEqual(hud.snapshot().focus.activeKinds, ['shell']);
  hud.apply(ev('UserPromptSubmit'));
  assert.deepEqual(hud.snapshot().focus.activeKinds, []);
});

test('turnEnded: set by Stop, StopFailure and interrupts; cleared by a prompt, session start or main tool call', () => {
  const { hud } = run([ev('SessionStart', { source: 'startup' })]);
  assert.equal(hud.snapshot().focus.turnEnded, false); // a fresh session waits at the desk
  hud.apply(ev('UserPromptSubmit'));
  hud.apply(ev('Stop'));
  assert.equal(hud.snapshot().focus.turnEnded, true);
  hud.apply(pre('Read', 'read', 'r1')); // a turn can start without a prompt (background task done)
  assert.equal(hud.snapshot().focus.turnEnded, false);
  hud.apply(ev('PostToolUseFailure', { tool: 'Read', kind: 'read', toolUseId: 'r1', interrupted: true }));
  assert.equal(hud.snapshot().focus.turnEnded, true);
  hud.apply(ev('UserPromptSubmit'));
  hud.apply(ev('StopFailure', { error: 'overloaded' }));
  assert.equal(hud.snapshot().focus.turnEnded, true);
  hud.apply(ev('SessionStart', { source: 'resume' }));
  assert.equal(hud.snapshot().focus.turnEnded, false);
});

test('a subagent call without its Post event ends with SubagentStop', () => {
  const { hud } = run([
    ev('UserPromptSubmit'),
    ev('SubagentStart', { agentId: 'ag1', agentType: 'Explore' }),
    ev('SubagentStart', { agentId: 'ag2', agentType: 'Plan' }),
    pre('Grep', 'search', 'x1', { agentId: 'ag1' }),
    pre('Read', 'read', 'x2', { agentId: 'ag2' }),
  ]);
  hud.apply(ev('SubagentStop', { agentId: 'ag1' }));
  const f = hud.snapshot().focus;
  assert.deepEqual(f.activeKinds, ['read']);
  assert.deepEqual(f.helpers, [{ id: 'ag2', agentType: 'Plan', kind: 'read' }]);
});

test('a compaction that never finishes is cleared by the next main tool call or Stop', () => {
  const a = run([ev('UserPromptSubmit'), ev('PreCompact', { trigger: 'auto' }), pre('Read', 'read', 'r1')]);
  assert.equal(a.focus.compacting, null);
  const b = run([ev('UserPromptSubmit'), ev('PreCompact', { trigger: 'manual' }), ev('Stop')]);
  assert.equal(b.focus.compacting, null);
  assert.equal(b.focus.status, 'idle');
  // A subagent's call does not end the main agent's compaction.
  const c = run([ev('UserPromptSubmit'), ev('PreCompact', { trigger: 'auto' }), pre('Read', 'read', 'x1', { agentId: 'ag1' })]);
  assert.equal(c.focus.compacting.trigger, 'auto');
});

test('TodoWrite counts reach the activity', () => {
  const { focus } = run([ev('UserPromptSubmit'), pre('TodoWrite', 'task', 't1', { todos: { total: 4, done: 1, doing: 1 } })]);
  assert.deepEqual(focus.activity.todos, { total: 4, done: 1, doing: 1 });
});
