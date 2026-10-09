// HUD session state, built only from real hook events (docs/DESIGN.md section 5).
// The server applies every published event in order and sends snapshot() to browsers.
// Nothing here is guessed: when the server joined a session late, values are flagged as
// lower bounds (`startExact` / `contextExact` = false) instead of being made up.

const MAX_SESSIONS = 20;
/** Tools that wait for the user's answer: what the agent waits for while one runs. */
const ASKS = { AskUserQuestion: 'question', ExitPlanMode: 'plan' };
/** Events that start a status at their own time, even as the first event the server sees. */
const STARTS_STATUS = new Set(['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Stop', 'StopFailure', 'SessionEnd']);

/** Level curve from DESIGN.md: level = floor(sqrt(xp / 5)) + 1. */
export function levelInfo(xp) {
  const levelStart = (l) => 5 * (l - 1) ** 2;
  let level = Math.floor(Math.sqrt(xp / 5)) + 1;
  while (levelStart(level) > xp) level--; // guard against float rounding
  while (levelStart(level + 1) <= xp) level++;
  const levelXp = levelStart(level);
  const nextLevelXp = levelStart(level + 1);
  return { xp, level, levelXp, nextLevelXp, progress: (xp - levelXp) / (nextLevelXp - levelXp) };
}

export class HudState {
  constructor({ xp = 0 } = {}) {
    this.xp = xp;
    this.sessions = new Map();
    this.focusId = null;
    this.anon = 0;
  }

  /** Applies one display event (from normalize.js). Returns true when XP changed. */
  apply(e) {
    const s = this.#session(e);
    const main = !e.agentId; // events from inside a subagent carry agent_id
    const first = s.events++ === 0;
    let xpChanged = false;

    s.lastEventAt = e.hookTs;
    if (e.project) s.project = e.project;
    if (e.effort) s.effort = e.effort;
    if (e.event !== 'SessionEnd') {
      s.endedAt = null;
      s.endReason = null;
    }

    switch (e.event) {
      case 'SessionStart':
        s.compacting = null;
        if (e.source === 'compact') {
          resetContext(s);
          break;
        }
        if (e.source === 'startup' || e.source === 'clear') {
          resetContext(s);
          s.toolsDone = 0;
        }
        // resume / fork keep what we know about the context (unknown if we never saw it).
        s.startedAt = e.hookTs;
        s.startExact = true;
        endTurn(s, true);
        s.turnEnded = false;
        s.error = null;
        s.helpers.clear();
        break;

      case 'UserPromptSubmit':
        endTurn(s, true);
        s.turnEnded = false;
        s.error = null;
        s.turn = true;
        s.turnStartedAt = e.hookTs;
        s.turnExact = true;
        break;

      case 'PreToolUse': {
        const p = s.permission;
        // A PermissionRequest that arrived before its own PreToolUse is paired here, not cleared.
        if (p && !p.toolUseId && p.tool === e.tool) p.toolUseId = e.toolUseId ?? null;
        else s.permission = null;
        s.active.set(e.toolUseId ?? `anon-${this.anon++}`, {
          tool: e.tool, kind: e.kind, target: e.target, todos: e.todos, agentId: e.agentId, startedAt: e.hookTs,
        });
        if (main) {
          s.turn = true;
          s.turnEnded = false;
          s.compacting = null; // the main agent cannot run tools while its context is compacting
          beginTurn(s, e);
        }
        break;
      }

      case 'PostToolUse':
      case 'PostToolUseFailure':
        finishTool(s, e);
        this.xp++;
        s.toolsDone++;
        xpChanged = true;
        if (main) {
          s.context++;
          s.turn = true;
        }
        // A user interrupt (Esc) ends the turn and no Stop event follows (hooks docs).
        if (e.interrupted) {
          endTurn(s, true);
          s.turnEnded = true;
        }
        break;

      case 'PermissionRequest': {
        // PermissionRequest has no tool_use_id: pair it with the latest running call of that tool.
        const paired = [...s.active].reverse().find(([, a]) => a.tool === e.tool);
        s.permission = { tool: e.tool, target: e.target, toolUseId: paired?.[0] ?? null };
        if (main) {
          s.turn = true;
          beginTurn(s, e);
        }
        break;
      }

      case 'SubagentStart':
        if (e.agentId) s.helpers.set(e.agentId, { agentType: e.agentType ?? null, startedAt: e.hookTs });
        break;

      case 'SubagentStop':
        s.helpers.delete(e.agentId);
        // A finished helper has no running calls; drop any whose Post event never came.
        if (e.agentId) for (const [key, a] of s.active) if (a.agentId === e.agentId) s.active.delete(key);
        break;

      case 'PreCompact':
        s.compacting = { trigger: e.trigger ?? null, startedAt: e.hookTs };
        break;

      case 'PostCompact':
        s.compacting = null;
        resetContext(s);
        break;

      case 'Stop':
        endTurn(s, false); // background subagent calls may still be running
        s.turnEnded = true;
        s.compacting = null; // a compaction without PostCompact (e.g. blocked) must not stay on
        break;

      case 'StopFailure':
        endTurn(s, false);
        s.turnEnded = true;
        s.compacting = null;
        s.error = { error: e.error ?? 'unknown', details: e.errorDetails ?? null };
        break;

      case 'SessionEnd':
        endTurn(s, true);
        s.helpers.clear();
        s.compacting = null;
        s.endedAt = e.hookTs;
        s.endReason = e.reason ?? null;
        break;
    }

    // When the current status began: "your turn for 4 min" on the HUD's status band.
    const now = status(s);
    if (now !== s.status) {
      s.status = now;
      s.statusSince = e.hookTs;
      // The first event the server sees may fall in the middle of a status (it joined late).
      s.statusExact = !first || STARTS_STATUS.has(e.event) || now === 'waiting';
    }
    return xpChanged;
  }

  snapshot() {
    let liveSessions = 0;
    for (const s of this.sessions.values()) if (s.endedAt === null) liveSessions++;
    const focus = this.sessions.get(this.focusId);
    return { stats: levelInfo(this.xp), liveSessions, focus: focus ? view(focus) : null };
  }

  // The focus session is the one with the most recent event (DESIGN.md "Multiple sessions").
  #session(e) {
    const id = e.sessionId ?? '?';
    let s = this.sessions.get(id);
    if (!s) {
      s = {
        id,
        project: e.project ?? null,
        firstSeenAt: e.hookTs,
        lastEventAt: e.hookTs,
        startedAt: e.hookTs,
        startExact: false, // becomes exact when we see SessionStart
        endedAt: null,
        endReason: null,
        effort: null,
        context: 0,
        contextExact: false, // exact after SessionStart(startup/clear/compact) or PostCompact
        tokens: null, // tokens in the main agent's context, from the transcript (server/transcript.js)
        tokensModel: null,
        toolsDone: 0,
        turn: false,
        turnEnded: false, // the last turn finished (Stop, StopFailure, interrupt) and no new one began
        active: new Map(), // tool_use_id -> running tool call
        permission: null,
        error: null,
        helpers: new Map(), // agent_id -> subagent
        compacting: null,
        events: 0, // events seen of this session
        status: null, // status after the latest event, and when it began
        statusSince: null,
        statusExact: false,
        turnStartedAt: null, // the current turn's prompt (or the first call seen of it)
        turnExact: false,
      };
      this.sessions.set(id, s);
      this.#prune(id);
    }
    this.focusId = id;
    return s;
  }

  /** Context size read from the session's transcript; true if it changed. */
  setContextTokens(sessionId, { tokens, model }) {
    const s = this.sessions.get(sessionId);
    if (!s || (s.tokens === tokens && s.tokensModel === (model ?? s.tokensModel))) return false;
    s.tokens = tokens;
    if (model) s.tokensModel = model;
    return true;
  }

  #prune(keepId) {
    while (this.sessions.size > MAX_SESSIONS) {
      let oldest = null;
      for (const s of this.sessions.values()) {
        if (s.id !== keepId && (!oldest || s.lastEventAt < oldest.lastEventAt)) oldest = s;
      }
      this.sessions.delete(oldest.id);
    }
  }
}

function resetContext(s) {
  s.context = 0;
  s.contextExact = true;
}

// Ends the main agent's turn. `all` also drops running subagent calls (new prompt, interrupt, end).
function endTurn(s, all) {
  s.turn = false;
  s.turnStartedAt = null;
  s.permission = null;
  for (const [key, a] of s.active) if (all || !a.agentId) s.active.delete(key);
}

// A main-agent call in a turn whose prompt the server did not see: the turn ran at least since then.
function beginTurn(s, e) {
  if (s.turnStartedAt !== null) return;
  s.turnStartedAt = e.hookTs;
  s.turnExact = false;
}

function finishTool(s, e) {
  let key = e.toolUseId && s.active.has(e.toolUseId) ? e.toolUseId : null;
  if (!key) {
    for (const [k, a] of s.active) {
      if (a.tool === e.tool && a.agentId === e.agentId) {
        key = k;
        break;
      }
    }
  }
  if (key) s.active.delete(key);
  const p = s.permission;
  if (p && (p.toolUseId ? p.toolUseId === e.toolUseId : p.tool === e.tool)) s.permission = null;
}

/** What the agent waits for from the user: 'permission', 'question', 'plan', or null. */
function waitFor(s) {
  if (s.permission) return ASKS[s.permission.tool] ?? 'permission';
  for (const a of s.active.values()) if (!a.agentId && ASKS[a.tool]) return ASKS[a.tool];
  return null;
}

function status(s) {
  if (s.endedAt !== null) return 'ended';
  if (s.error) return 'error';
  if (waitFor(s)) return 'waiting';
  if (s.turn || s.active.size || s.compacting) return 'working';
  return 'idle';
}

function view(s) {
  const active = [...s.active.values()];
  // The character shows the main agent's own call; subagent calls only when it has none.
  const current = active.findLast((a) => !a.agentId) ?? active.at(-1);
  const helperKind = (id) => active.findLast((a) => a.agentId === id)?.kind ?? null;
  return {
    sessionId: s.id,
    project: s.project,
    status: status(s),
    waitFor: waitFor(s),
    // When the status began; while working, since the turn's prompt (a permission in between
    // does not restart it). Exact = false when the server joined in the middle of it.
    ...(status(s) === 'working' && s.turnStartedAt !== null
      ? { statusSince: s.turnStartedAt, statusExact: s.turnExact }
      : { statusSince: s.statusSince, statusExact: s.statusExact }),
    startedAt: s.startedAt,
    startExact: s.startExact,
    endedAt: s.endedAt,
    endReason: s.endReason,
    lastEventAt: s.lastEventAt,
    effort: s.effort,
    context: s.context,
    contextExact: s.contextExact,
    tokens: s.tokens,
    tokensModel: s.tokensModel,
    toolsDone: s.toolsDone,
    turnEnded: s.turnEnded,
    activity: current
      ? {
        tool: current.tool, kind: current.kind, target: current.target, todos: current.todos,
        agentId: current.agentId, startedAt: current.startedAt,
      }
      : null,
    activeKinds: [...new Set(active.map((a) => a.kind))],
    permission: s.permission ? { tool: s.permission.tool, target: s.permission.target } : null,
    error: s.error,
    // One entry per running subagent; `kind` = what its latest running call is doing.
    helpers: [...s.helpers].map(([id, h]) => ({ id, agentType: h.agentType, kind: helperKind(id) })),
    compacting: s.compacting,
  };
}
