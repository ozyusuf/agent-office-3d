// Decides what the realm shows for the server's session state (docs/DESIGN.md section 5): where the
// character goes and what it does, which stations are busy, how lit the scene is, how fast the data
// falls run and how many rack LEDs glow. Everything follows real hook events; the only additions
// are short hold times, so a call that took 50 ms is still visible for a moment.
// Pure logic (no three.js, no DOM), so node:test covers it. Times are epoch milliseconds.

import { activeStations, stationForKind } from '../stations.js';

/** The character stays at a work station this long after its call ended (no running back and forth). */
export const LINGER_MS = 2500;
/** A station stays lit at least this long after a PreToolUse, even if the call ended sooner. */
export const HOLD_MS = 700;
/** Window for the activity rate that drives the data falls. */
export const RATE_WINDOW_MS = 60_000;

// Stations the character walks to, and its pose there. Every other tool is worked from the desk.
const WALK_TO = { editor: 'code', board: 'present' };
const BOARD_KINDS = new Set(['read', 'search', 'task']);

export function createDirector() {
  let work = null; // { spot, pose, until }: the last work station, kept for LINGER_MS
  const holds = new Map(); // station -> lit until
  let board = null; // what the board shows: { kind, target, todos }

  function remember(activity, now) {
    const station = stationForKind(activity.kind);
    work = WALK_TO[station] ? { spot: station, pose: WALK_TO[station], until: now + LINGER_MS } : null;
  }

  function showOnBoard(a) {
    if (BOARD_KINDS.has(a.kind)) board = { kind: a.kind, target: a.target ?? '', todos: a.todos ?? null };
  }

  return {
    /** A live event (not one replayed from history). */
    note(e, now) {
      // A failed call ends its station's hold, so the station can sputter out (realm.js).
      if (e.event === 'PostToolUseFailure') holds.delete(stationForKind(e.kind));
      if (e.event !== 'PreToolUse') return;
      holds.set(stationForKind(e.kind), now + HOLD_MS);
      if (!e.agentId) remember(e, now);
      showOnBoard(e);
    },

    /**
     * Where the character should be and what it does.
     * @returns {{ spot: string, pose: string, visible: boolean, faceCamera?: boolean }}
     */
    character(focus, now) {
      if (!focus || focus.status === 'ended') {
        work = null;
        return { spot: 'desk', pose: 'stand', visible: false };
      }
      // Only the main agent's own calls move the character; helpers' calls show as helper bots.
      const main = focus.activity && !focus.activity.agentId ? focus.activity : null;
      if (main) remember(main, now);
      const station = main ? stationForKind(main.kind) : null;
      const spotNow = main ? (WALK_TO[station] ? station : 'desk') : null;

      switch (focus.status) {
        case 'error':
          work = null;
          return { spot: 'desk', pose: 'slump', visible: true };
        case 'waiting':
          return { spot: spotNow ?? 'desk', pose: 'wave', visible: true, faceCamera: true };
        case 'idle':
          work = null;
          return focus.turnEnded
            ? { spot: 'arcade', pose: 'play', visible: true }
            : { spot: 'desk', pose: 'stand', visible: true };
      }
      if (main) return { spot: spotNow, pose: WALK_TO[station] ?? 'type', visible: true };
      if (work && now < work.until) return { spot: work.spot, pose: work.pose, visible: true };
      work = null;
      return { spot: 'desk', pose: focus.compacting ? 'stand' : 'type', visible: true };
    },

    /** Station keys that are busy now: the server's running calls plus the short holds. */
    stations(focus, now) {
      const on = activeStations(focus);
      if (!focus || focus.status === 'ended') return on;
      for (const [key, until] of holds) {
        if (now < until) on.add(key);
        else holds.delete(key);
      }
      return on;
    },

    /** What the board shows: the latest read / search / task call (kept after it ends). */
    board(focus) {
      if (focus?.activity) showOnBoard(focus.activity);
      return board;
    },
  };
}

/** Events in the last minute (any session): the realm's activity. */
export function eventRate(times, now) {
  let n = 0;
  for (const t of times) if (now - t <= RATE_WINDOW_MS) n++;
  return n;
}

/** Data fall speed factor: slow when nothing happens, up to ~4x at 40+ events per minute. */
export function fallsSpeed(eventsPerMinute) {
  return 0.3 + 3.5 * Math.min(1, eventsPerMinute / 40);
}

/** Rack LEDs lit = context fill share of all LEDs; none while compacting (they drain). */
export function rackTarget(focus, fill, ledCount) {
  if (!focus || focus.compacting) return 0;
  return Math.round(Math.max(0, Math.min(1, fill)) * ledCount);
}

/** Scene power: on while a session runs; standby before the first event and after SessionEnd. */
export function powerOf(focus) {
  return focus && focus.status !== 'ended' ? 1 : 0;
}

/** Red alert: the turn ended with an API error (StopFailure) and no new prompt came yet. */
export function alertOf(focus) {
  return focus?.status === 'error' ? 1 : 0;
}

// ---- Frame pacing (D67) ----
// The realm draws at full rate only while something travels across the screen (the character
// walking to another station, a level-up burst, a shooting star). Everything else moves slowly
// (typing, spinning stations, strolls, clouds, falls), so a running session draws at half rate, and
// standby or a finished turn with nothing new for a minute at a quarter: the monitor sits next to
// the editor all day and should cost little CPU.

/** Frames per second for each pace (the frame-rate setting can lower them, never raise them). */
export const PACE_FPS = { active: 60, calm: 30, standby: 15 };
/** A finished turn rests at the standby rate once no event came for this long. */
export const REST_AFTER_MS = 60_000;

/**
 * @param {object|null} focus  the server's focus session
 * @param {{ travelling: boolean, strolling: boolean, quietMs: number }} scene  travelling = a walk
 *   to another station, a burst or a shooting star; strolling = a short walk between two stands;
 *   quietMs = time since the last event
 * @returns {'active' | 'calm' | 'standby'}
 */
export function paceOf(focus, { travelling, strolling, quietMs }) {
  if (travelling) return 'active';
  if (!powerOf(focus)) return 'standby';
  if (focus.status !== 'idle' || strolling || quietMs < REST_AFTER_MS) return 'calm'; // (the storm's rain needs 30)
  return 'standby';
}

/**
 * Shortest time between two drawn frames for `fps`: a little under one frame time, so a 60 Hz
 * screen whose frames arrive with some jitter still draws every frame (or every 2nd / 4th one),
 * and 120/144 Hz screens draw at most ~72 fps.
 */
export function frameGap(fps) {
  return 1000 / fps - 3.3;
}
