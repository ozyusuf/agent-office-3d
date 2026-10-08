# agent-office-3d

A cyber-RPG themed 3D live monitor that shows what the Claude Code agent is doing right now.
Runs in a separate, narrow portrait browser window (half the screen) next to VS Code. Open source;
a "how it was built" guide will be written at the end.

**Every session: read `docs/PROGRESS.md` at the start and update it at the end.**

## Architecture
Claude Code hooks -> local server (127.0.0.1 only) -> WebSocket -> three.js page.
- `hooks/send-event.ps1` - PowerShell hook script. Forwards the raw hook JSON (stdin) to `POST /event`.
- `server/index.js` - Node HTTP + `ws` server: receives events, reorders by hook start time,
  keeps recent history, broadcasts to browsers, serves `web/`.
- `server/normalize.js` - turns raw hook JSON into a small display event (no file contents).
- `web/` - browser page. Plain ES modules, no build step, no framework.

## Hard rules
- Hooks are `type: "command"`, run by Windows PowerShell 5.1 (`powershell.exe`) with `"async": true`.
- The hook script never writes to stdout, exits silently if the server is down, never blocks or delays Claude.
- No `prompt` or `agent` hooks. No model calls anywhere.
- Hooked events: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure,
  PermissionRequest, SubagentStart, SubagentStop, PreCompact, PostCompact, Stop, StopFailure.
- Never guess hook field names or settings format: verify against https://code.claude.com/docs/en/hooks.
- Never touch `~/.claude/settings.json` without a backup and the user's explicit approval.
  During development hooks live in this repo's `.claude/settings.json`.
- Stack: Node.js, `ws`, three.js (ES modules). No frameworks, no bundler.
- Never show made-up data. Every number and bar on screen must come from a real hook event.
- Server binds to 127.0.0.1 only and checks Host/Origin headers.
- Visual work: follow `docs/DESIGN.md`; look at `docs/design/reference.png` when in doubt.
- Performance: cap pixel ratio, stop rendering when the tab is hidden, bloom can be turned off.

## Working with the user
- All repo files in English. Talk to the user in Turkish.
- The user does not review code. At the end of each stage: short summary + step-by-step "how to try it".
- Finish one stage, then stop. Start the next stage only when the user types `/next`.
- Ask before downloading any asset (models, fonts, textures). Only CC0 / OFL-style licenses.

## Commands
```
npm install          # once
npm start            # server on http://127.0.0.1:7847 (env AGENT_OFFICE_PORT to change)
npm test             # node:test unit tests
```
Test the hook by hand (PowerShell):
`'{"hook_event_name":"Stop","session_id":"t"}' | powershell -NoProfile -ExecutionPolicy Bypass -File hooks/send-event.ps1`

## Docs map
- `docs/PLAN.md` - stages, checkbox tasks, "done" criteria per stage.
- `docs/DESIGN.md` - palette, screen layout, scene objects, event -> reaction table.
- `docs/PROGRESS.md` - session log: done, remaining, known issues, next step.
- `docs/DECISIONS.md` - decisions and why.
- `docs/design/reference.png` - target visual reference.
- `.claude/commands/next.md` (`/next`), `.claude/commands/wrap.md` (`/wrap`).
