# Plan

Six stages. Finish one, stop, wait for `/next`. Tick boxes in `/wrap`.
Design details live in `DESIGN.md`; reasons in `DECISIONS.md`.

## Stage 1 - Hook -> server -> plain event list (no 3D)
- [x] Verify hook event names, input fields and settings format against the official docs
- [x] `hooks/send-event.ps1`: read stdin bytes, POST to `127.0.0.1:<port>/event`, silent on any failure
- [x] `.claude/settings.json`: all 13 events (incl. PostToolUseFailure, D13), `command` type, PowerShell exec form, `async: true`
- [x] `server/index.js`: HTTP on 127.0.0.1, Host/Origin checks, `POST /event`, `GET /health`, static `web/`
- [x] Reorder buffer (sort by hook process start time) + in-memory recent history (200 events)
- [x] WebSocket `/ws`: `hello` with history on connect, then `event` messages
- [x] `server/normalize.js`: compact display event (tool kind, short target, no file contents)
- [x] `web/index.html`: plain live list, connection status, auto reconnect, expandable rows
- [x] Unit tests for `normalize.js`
- [x] Live check: real events from this Claude Code session appear in the browser

**Done when:** with `npm start` running, using Claude Code in this project makes each hook event
appear in the browser list within ~1 s, in order; stopping the server does not slow Claude down
or print anything into the conversation.

## Stage 2 - Screen layout (HTML/CSS layer), palette, real data
- [x] Move the stage 1 list to `web/debug.html` (keep it as a dev tool)
- [x] `web/theme.css`: palette tokens from `DESIGN.md`
- [x] `web/i18n.js`: all UI strings, `tr` + `en`; default language from settings
- [x] Settings file (`config.json`, gitignored; `config.example.json` committed) - realm title, subtitle, agent name, language, port
- [x] Layout for a narrow portrait window: title banner, top-left stats panel, top-right status icons,
      character label, station label slots, hook log, skill bar
- [x] Server-side session state: tool count since last compact, effort level, session start, current activity
- [x] Persistent stats file (gitignored): total tool uses -> level + XP progress
- [x] Hook log: timestamped, auto-scrolling, human-readable lines in the chosen language
- [x] Skill bar: Read, Grep, Edit, Bash, Web, Permission. Active glows; permission blinks yellow
- [x] Top-right icons: server connection, session state (active / idle / ended / error), settings button
- [x] Empty states: before the first event show "waiting for events", never placeholder numbers

**Done when:** the HUD matches the reference layout in a ~600x1000 window, every bar/number is
driven by real events (verified by reading the server state), and switching language works.

## Stage 3 - Static 3D scene
- [ ] `npm i three`; serve `node_modules/three` under `/vendor/three/` with an import map
- [ ] Renderer: pixel ratio cap, pause on `visibilitychange`, resize to portrait window
- [ ] Isometric (orthographic) camera framed for portrait
- [ ] Floating metal platforms, pipes, neon edge strips, background haze
- [ ] Stations built from primitives: command desk, Code Smelter, Vision & Task Board, Test Centrifuge,
      Orbit Sphere, server racks, data waterfalls, portal ring, arcade machine
- [ ] Character from simple shapes (headphones, visor, hoodie). If not good enough: propose a CC0 model, ask first
- [ ] Bloom (UnrealBloomPass) with a toggle; fallback without postprocessing
- [ ] Station labels projected from 3D positions into the HTML layer
- [ ] FPS check on a weak GPU profile (bloom off, pixel ratio 1)

**Done when:** the scene reads like the reference at a glance, runs smoothly with bloom on,
stops drawing when hidden, and all labels track their stations.

## Stage 4 - Events -> animations
- [ ] Central state machine (idle / working / waiting permission / stopped / error) fed by events
- [ ] Character walks/turns to the active station; returns to desk when idle
- [ ] Each row of the event -> reaction table in `DESIGN.md` implemented
- [ ] Pair PreToolUse with PostToolUse or PostToolUseFailure by `tool_use_id`; no station stays stuck "on"
- [ ] Subagent helpers: spawn from portal on SubagentStart, return on SubagentStop (one per `agent_id`)
- [ ] Compaction: server racks drain; context bar resets
- [ ] StopFailure: lights out, red alert; cleared by the next prompt
- [ ] Smooth transitions, no work while idle beyond ambient loops

**Done when:** a normal Claude Code session (read, grep, edit, bash, web, permission, subagent,
stop) plays out visibly on screen with correct stations and no stuck states.

## Stage 5 - Personalisation and settings
- [ ] Settings panel (opened from the top-right icon): agent name, realm title + subtitle, language,
      accent colour, bloom on/off, pixel ratio cap, context bar scale
- [ ] Settings persist (server-side config file) and apply live without reload
- [ ] Accent colour re-tints neon materials and HUD tokens

**Done when:** every setting changes the screen live and survives a server restart.

## Stage 6 - Install, docs, release
- [ ] Install script (PowerShell): `npm install`, back up `~/.claude/settings.json`, show the diff,
      merge hooks only after explicit confirmation; uninstall script restores the backup
- [ ] Optional: start server on login / from a desktop shortcut
- [ ] English README: what it is, screenshots, requirements, install, privacy (localhost only)
- [ ] "How it was built" guide (`docs/HOW-IT-WAS-BUILT.md`) from PROGRESS + DECISIONS
- [ ] Screenshots / short GIF of each state
- [x] Choose a license with the user; add LICENSE file (MIT, 2026-10-09)
- [ ] Cross-platform note: hook script for macOS/Linux (sh/curl) or document Windows-only

**Done when:** a fresh clone can be installed on another Windows machine by following only the README.
