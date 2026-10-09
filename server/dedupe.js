// Drops the second copy of a hook event. After the installer adds the hook to the user's settings,
// a session in a project that registers the hook too (this repo does, for development) can run it
// twice for one event. Both copies carry the same stdin bytes and were fired at the same moment, so
// "same body, fired within WINDOW_MS" marks a copy (D59).

import { createHash } from 'node:crypto';

const WINDOW_MS = 2000;
const KEEP_MS = 10000;

export class Deduper {
  constructor({ windowMs = WINDOW_MS, keepMs = KEEP_MS } = {}) {
    this.windowMs = windowMs;
    this.keepMs = keepMs;
    this.seen = new Map(); // body hash -> { at, firedAt }
    this.dropped = 0;
  }

  // body: the raw request bytes; firedAt: the hook's process start (X-Hook-Ts) or NaN; now: arrival.
  isCopy(body, firedAt, now = Date.now()) {
    for (const [key, entry] of this.seen) {
      if (now - entry.at <= this.keepMs) break; // the map is in arrival order
      this.seen.delete(key);
    }
    const key = createHash('sha1').update(body).digest('base64');
    const prev = this.seen.get(key);
    // Compare fire times when both hooks sent one; arrival times otherwise.
    const gap = Number.isFinite(firedAt) && Number.isFinite(prev?.firedAt) ? Math.abs(firedAt - prev.firedAt) : now - prev?.at;
    if (prev && gap <= this.windowMs) {
      this.dropped++;
      return true;
    }
    this.seen.delete(key);
    this.seen.set(key, { at: now, firedAt });
    return false;
  }
}
