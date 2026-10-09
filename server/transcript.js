// Context use, read from the session transcript (D55). `transcript_path` is a documented common
// hook field, but the file's JSON Lines format is not documented and the file may lag a step behind
// the conversation, so this is best effort and only ever produces one number: the tokens in the
// main agent's context after its newest API call (input + cache writes + cache reads + output),
// or the context size right after the newest compaction (`compact_boundary` -> postTokens).
// Nothing else from the file is kept or sent anywhere. Anything unexpected -> null, and the HUD
// falls back to counting tool calls.

import fs from 'node:fs/promises';
import path from 'node:path';

const TAILS = [512 * 1024, 4 * 1024 * 1024]; // read the end of the file; a bit more if needed

const count = (n) => Number.isSafeInteger(n) && n >= 0;

/** Newest context size in transcript lines (oldest first), or null. */
export function contextFromLines(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Cheap filter first: tool results can be huge and never matter here.
    if (!line.includes('"usage"') && !line.includes('compact_boundary')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o?.type === 'system' && o.subtype === 'compact_boundary') {
      const n = o.compactMetadata?.postTokens;
      if (count(n)) return { tokens: n, model: null, compacted: true };
      continue;
    }
    if (o?.type === 'assistant' && o.isSidechain !== true && o.message?.usage) {
      const u = o.message.usage;
      const parts = [u.input_tokens, u.cache_creation_input_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.output_tokens ?? 0];
      if (!parts.every(count)) continue;
      const tokens = parts.reduce((a, b) => a + b, 0);
      const model = typeof o.message.model === 'string' ? o.message.model : null;
      if (tokens === 0 || model === '<synthetic>') continue; // local messages, not API calls
      return { tokens, model, compacted: false };
    }
  }
  return null;
}

/** Reads the end of a transcript file; null when it is missing, unreadable or has no usage yet. */
export async function readContext(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !file.endsWith('.jsonl')) return null;
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const { size } = await handle.stat();
    for (const want of TAILS) {
      const len = Math.min(size, want);
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      if (len < size) lines.shift(); // the first line is cut off
      const found = contextFromLines(lines);
      if (found || len === size) return found;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
