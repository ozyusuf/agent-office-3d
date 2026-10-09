# agent-office-3d

A cyber-RPG themed 3D live monitor that shows what the Claude Code agent is doing right now. Runs in a
narrow portrait browser window next to VS Code. Open source; a "how it was built" guide comes at the end.

**Every session: read `docs/PROGRESS.md` at the start and update it at the end.**

## Architecture
Claude Code hooks -> local server (127.0.0.1 only) -> WebSocket -> three.js page.
- `hooks/send-event.ps1` - PowerShell hook script. Forwards the raw hook JSON (stdin) to `POST /event`.
- `server/index.js` - Node HTTP + `ws`: `POST /event` (drop duplicates `dedupe.js`, reorder by hook start
  time, history, broadcast event + state), `POST /config` (settings panel), `POST /shutdown` (stop.ps1),
  `GET /state`, `GET /health`, serves `web/` + three.js at `/vendor/three/`.
- `server/normalize.js` - raw hook JSON -> small display event. `server/state.js` - session state
  machine + level curve. `server/transcript.js` - context tokens from the transcript. `config.js`, `stats.js`.
- `web/` - plain ES modules, no build step: HUD `index.html` + `app.js`, `hud.css`, `theme.css`, `i18n.js`,
  `narrate.js`, `stations.js`, `labels.js`, `palette.js`, `settings.js`, `context.js`; `debug.html` raw events.
  3D scene in `web/scene/`: `realm.js` (renderer, camera, bloom, loop, state -> `drive`), `director.js`
  + `walk.js` + `life.js` + `daylight.js` (pure, tested), `world.js`, `sky.js`, `props.js`, `character.js`, `helpers.js`,
  `effects.js`, `kit.js`.
- Install (Windows, D58-D60): `install.ps1` / `uninstall.ps1` -> `scripts/setup.js` + pure `hooks-config.js`
  (user settings: diff, "y", backup); `scripts/start.ps1`, `stop.ps1`, `shortcut.ps1`, `common.ps1`.
- Local files (gitignored): `config.json` (see `config.example.json`), `data/` (stats.json = XP, install.json).

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
- Visual work: follow `docs/DESIGN.md` (source of truth for the look and the station placement).
- Performance: cap pixel ratio, stop rendering when the tab is hidden, bloom can be turned off.

## Working with the user
- All repo files in English. Talk to the user in Turkish.
- The user does not review code. At the end of each stage: short summary + step-by-step "how to try it".
- Finish one stage, then stop. Start the next stage only when the user types `/next`.
- Ask before downloading any asset (models, fonts, textures). Only CC0 / OFL-style licenses.

## Commands
```
npm install; npm start   # server on http://127.0.0.1:7847 (port: env AGENT_OFFICE_PORT > config.json)
npm test                 # node:test unit tests
```
Scratch test server (never the user's data): set `AGENT_OFFICE_PORT`, `AGENT_OFFICE_CONFIG`, `AGENT_OFFICE_DATA`.
Never send test events to the server the user watches. Test the hook by hand (PowerShell):
`'{"hook_event_name":"Stop","session_id":"t"}' | powershell -NoProfile -ExecutionPolicy Bypass -File hooks/send-event.ps1`

## Docs map
- `docs/PLAN.md` - stages, checkbox tasks, "done" criteria per stage.
- `docs/DESIGN.md` - palette, screen layout, scene objects, event -> reaction table.
- `docs/PROGRESS.md` - session log. `docs/DECISIONS.md` - decisions and why.
- `docs/HOW-IT-WAS-BUILT.md` - public guide. `docs/screenshots/` - README images (real sessions only, D62).
- `.claude/commands/next.md` (`/next`), `.claude/commands/wrap.md` (`/wrap`).
