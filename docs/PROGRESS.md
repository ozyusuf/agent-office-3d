# Progress

## Current state
- **Stage 1 done** (verified 2026-10-09). Next: **Stage 2 - screen layout (HTML/CSS), palette, real data.**
- Run: `npm start`, open http://127.0.0.1:7847. Hooks are active for Claude Code sessions in this repo.
- Hooked events: 13 (12 from the brief + `PostToolUseFailure`, D13). All Stage 1 work is committed.

## Session log (newest first)

### 2026-10-09 - Session 1 - Stage 0 (docs) + Stage 1 (hook -> server -> list)
**Done**
- Saved the target image to `docs/design/reference.png`.
- Wrote CLAUDE.md, PLAN, DESIGN (palette measured from the image), DECISIONS, PROGRESS,
  `/next` and `/wrap` commands, `.gitignore`; `git init -b main`; `npm i ws`.
- Verified hook names, input fields and the PowerShell exec-form settings against
  https://code.claude.com/docs/en/hooks (Claude Code here: 2.1.292 VS Code extension).
- `hooks/send-event.ps1`, `.claude/settings.json` (12 events, async), `server/index.js`,
  `server/normalize.js`, `web/index.html|app.js|style.css`, `test/normalize.test.js` (9 tests pass).
- Checks run:
  - server down: hook exits 0, prints nothing, ~0.8 s (0.45 s is PowerShell startup; async, so Claude does not wait);
  - security: POST without `X-Agent-Office` -> 403, foreign Origin -> 403, path traversal -> 404,
    WebSocket from foreign Origin -> 403;
  - 4 hooks fired 15 ms apart in parallel arrive in the right order; Turkish text intact;
  - live: the hook settings were picked up by this running session without a restart, and real
    PreToolUse/PostToolUse events from Claude's own tool calls showed up in the browser
    (headless Edge screenshot).

**Left:** stages 2-6 (see PLAN.md).

- Follow-up (user approved): added `PostToolUseFailure` as the 13th event (D13). Verified live: a
  Bash call that exited with code 3 arrived as `PostToolUseFailure · Bash · Exit code 3`. 10 tests pass.

**Known issues / open questions**
- Latency hook -> browser is ~0.6-1.1 s (PowerShell 5.1 startup + 350 ms reorder window).
  OK for a monitor; `REORDER_MS` could be lowered if needed.
- `SessionEnd` runs async; Claude Code may exit before the PowerShell process sends it. Not verified yet.
- Resolved: hook processes do not flash a console window (checked by the user while ~20 hooks ran).
- Windows: stopping a background `npm start` leaves the `node` child running. In Claude background
  tasks start the server with `node server/index.js` instead.
- Test-only events must not be sent to a server the user is watching (no made-up data on screen).

**Next step:** `/next` -> Stage 2. First tasks: move the list to `web/debug.html`, add `theme.css`
tokens and `i18n.js`, then the HUD layout.
