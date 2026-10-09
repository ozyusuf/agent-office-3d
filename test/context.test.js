import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contextFromLines, readContext } from '../server/transcript.js';
import { HudState } from '../server/state.js';
import { windowFor, contextFill, formatTokens } from '../web/context.js';

const assistant = (usage, extra = {}) => JSON.stringify({
  type: 'assistant', isSidechain: false, message: { model: 'claude-test', usage, content: [] }, ...extra,
});
const usage = (input, write, read, output) => ({ input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: output });

test('transcript: newest main-thread API call counts input, cache and output tokens', () => {
  const lines = [
    assistant(usage(10, 100, 1000, 5)),
    JSON.stringify({ type: 'user', message: { content: 'x'.repeat(5000) } }),
    assistant(usage(2, 1959, 503325, 2186)),
    assistant(usage(1, 1, 1, 1), { isSidechain: true }), // a subagent's call: its own context
    assistant(usage(0, 0, 0, 0), { message: { model: '<synthetic>', usage: usage(0, 0, 0, 0) } }),
    '{ broken json',
  ];
  assert.deepEqual(contextFromLines(lines), { tokens: 507472, model: 'claude-test', compacted: false });
});

test('transcript: a compaction resets to its post-compaction size until the next call', () => {
  const boundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 978681, postTokens: 22213 } });
  assert.deepEqual(contextFromLines([assistant(usage(2, 0, 970000, 10)), boundary]), { tokens: 22213, model: null, compacted: true });
  assert.equal(contextFromLines([boundary, assistant(usage(5, 100, 23000, 50))]).tokens, 23155);
  assert.equal(contextFromLines([]), null);
  assert.equal(contextFromLines([assistant({ input_tokens: 'x' })]), null);
});

test('transcript file: reads only the end, ignores the cut first line, refuses odd paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-ctx-'));
  const file = path.join(dir, 'session.jsonl');
  const filler = JSON.stringify({ type: 'user', message: { content: 'y'.repeat(700 * 1024) } }); // > first tail
  fs.writeFileSync(file, `${assistant(usage(1, 2, 3, 4))}\n${filler}\n`);
  assert.equal((await readContext(file)).tokens, 10); // found by the larger, second tail
  fs.appendFileSync(file, `${assistant(usage(10, 20, 30, 40))}\n`);
  assert.equal((await readContext(file)).tokens, 100);
  assert.equal(await readContext(path.join(dir, 'missing.jsonl')), null);
  assert.equal(await readContext('relative/session.jsonl'), null);
  assert.equal(await readContext(path.join(dir, 'notes.txt')), null);
});

test('server state keeps the context size per session', () => {
  const hud = new HudState();
  hud.apply({ event: 'SessionStart', sessionId: 's1', source: 'startup', hookTs: 1 });
  assert.equal(hud.snapshot().focus.tokens, null);
  assert.equal(hud.setContextTokens('s1', { tokens: 1200, model: 'm' }), true);
  assert.equal(hud.setContextTokens('s1', { tokens: 1200, model: 'm' }), false);
  assert.equal(hud.setContextTokens('nope', { tokens: 5, model: null }), false);
  assert.deepEqual([hud.snapshot().focus.tokens, hud.snapshot().focus.tokensModel], [1200, 'm']);
  hud.setContextTokens('s1', { tokens: 300, model: null }); // after a compaction: model unknown, keep the last
  assert.deepEqual([hud.snapshot().focus.tokens, hud.snapshot().focus.tokensModel], [300, 'm']);
});

test('context fill: tokens over the window, or the tool-call fallback', () => {
  assert.equal(windowFor(150000), 200000);
  assert.equal(windowFor(505000), 1000000);
  assert.equal(windowFor(505000, 200000), 200000);
  assert.equal(contextFill({ tokens: 100000, context: 3 }, {}), 0.5);
  assert.equal(contextFill({ tokens: 500000, context: 3 }, { contextWindow: 'auto' }), 0.5);
  assert.equal(contextFill({ tokens: 500000, context: 3 }, { contextWindow: 200000 }), 1);
  assert.equal(contextFill({ tokens: null, context: 75 }, { contextBarMax: 150 }), 0.5);
  assert.equal(contextFill(null, {}), 0);
  assert.deepEqual([formatTokens(950), formatTokens(1234), formatTokens(22213), formatTokens(505000), formatTokens(1e6), formatTokens(1250000)],
    ['950', '1.2k', '22.2k', '505k', '1M', '1.3M']);
});
