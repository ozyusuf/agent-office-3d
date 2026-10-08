// Lifetime stats on disk (`data/stats.json`, gitignored): total finished tool calls = XP.
// Only the server writes this file. Writes are debounced and atomic (temp file + rename).

import fs from 'node:fs';
import path from 'node:path';

export function loadStats(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { xp: 0, warning: null };
  }
  try {
    const data = JSON.parse(text);
    if (Number.isSafeInteger(data.xp) && data.xp >= 0) return { xp: data.xp, warning: null };
  } catch {
    // fall through
  }
  // Keep the unreadable file instead of overwriting it, so nothing is lost silently.
  const kept = `${file}.unreadable-${Date.now()}`;
  try {
    fs.renameSync(file, kept);
  } catch {
    // ignore
  }
  return { xp: 0, warning: `${file} was unreadable (moved to ${path.basename(kept)}); XP starts at 0` };
}

export function createStatsWriter(file, delayMs = 1000) {
  let pending = null;
  let timer = null;

  function write() {
    clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const data = pending;
    pending = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error(`Could not save stats to ${file}: ${err.message}`);
    }
  }

  return {
    save(xp) {
      pending = { version: 1, xp, updatedAt: new Date().toISOString() };
      timer ??= setTimeout(write, delayMs);
    },
    flush: write,
  };
}
