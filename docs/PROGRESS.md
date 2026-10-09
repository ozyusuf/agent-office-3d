# Progress

## Current state
- **Stage 8 (glance status) built, v0.3.0** (2026-10-09, D68): green / yellow / red window frame,
  `?` `!` `✓` `✕` bubble over the nameplate, header chip "Done · 4m 05s", questions and plan
  approvals count as waiting. Open: the user's live check on the tablet.
- Stage 7 (performance, v0.2.0, D67) done; README "Update" section + CHANGELOG.md for installed users.
- Plan limits cannot be shown in the VS Code extension (D69).
- Run: `npm install`, `npm start`, open http://127.0.0.1:7847 (HUD) or /debug.html (raw events).
  Restart the server after pulling new server code (an old `node server/index.js` keeps running
  the old code). `?hour=0..24` fixes the sky's time for one tab.
- Settings: gear icon -> saved to `config.json` (gitignored; the port is set there by hand). XP lives
  in `data/stats.json` (gitignored).

## Session log (newest first)

### 2026-10-09 - Session 9 - Stage 8 (glance status) + update docs
**Done**
- Update docs for installed users: README "Update" (stop, `git pull`, `install.ps1`, ZIP installs,
  local-change conflicts), `CHANGELOG.md`, version 0.2.0, `/wrap` adds user-facing changes there.
- Stage 8 (user: see from another room, on a tablet used as a second screen, whether Claude works,
  asks something or is done). Verified in the hooks docs: AskUserQuestion / ExitPlanMode run as
  tools until the user answers, so no new hook event is needed.
- Server: `waitFor` (permission / question / plan), `statusSince` / `statusExact`, AskUserQuestion
  keeps only the first question's header chip. Client: `glanceOf()`; window frame (setting
  `statusFrame`), bubble on the nameplate (hops only while waiting, moved on rendered frames),
  header chip and tab title with since when, nameplate "Done, your turn", log lines for questions
  and plans. Version 0.3.0.
- A first version with a big status band was built and shown; the user found the text too big and
  wanted the character to show it, but liked the green frame: band removed (D68).
- Plan limits (D69): the status line JSON has `rate_limits`, but a probe `statusLine` in
  `.claude/settings.local.json` never ran in the VS Code extension (probe removed).
- Checks: scratch server (port 7863, scratch config/data): screenshots of working / done /
  question / permission / error at 600x1000, 420x900, 702x765, 1280x800; hop sampled; settings
  toggle saves `statusFrame: false`; no console errors; CPU same as HEAD within noise (a floating
  done bubble cost ~6 %, so it stays still). 103 tests pass.

**Left:** the user's live check on the tablet (a real question, permission and finished turn).

**Known issues / open questions**
- CPU % numbers depend on the machine's power state: the same HEAD measured 48 % idle earlier and
  93 % later in the day; compare versions side by side only.
- A question asked in plain text ends with Stop: shown as Done (the user's turn), not as a question.
- Once in headless Edge the 3D scene did not start (labels fell back to slots); not reproducible.

**Next step:** the user tries v0.3.0 on the tablet; adjust bubble size / frame width from their
feedback. Optional: a GitHub release so watchers get notified; limits for CLI users (D69).

### 2026-10-09 - Session 8 - Stage 7 (performance, user request)
**Done**
- The user: install on a friend's Windows machine works; the 3D view feels heavy on the CPU.
- Harness (scratchpad, not in the repo): scratch server (port 7863, scratch config/data) + headless
  Edge over the DevTools protocol; CPU time per process (`SystemInfo.getProcessInfo`), rendered
  frames and draw calls (WebGL wrapped), main-thread metrics, CPU profile; scenarios standby / idle /
  idle after a quiet minute / busy (raw hook JSON every 1.5 s). The old version ran side by side
  from a git worktree of HEAD. Test events only went to the scratch server.
- Found: ~55-60 fps in every state; three.js re-checked ~24 shader programs per frame (transparent
  DoubleSide materials are drawn twice); the label layer forced a layout per frame; the status dot's
  endless CSS animation kept the browser composing at the screen rate while working.
- Fixed (D67): frame pacing (`paceOf` / `frameGap`), `forceSinglePass`, `freeze()` (static world and
  decor merged per material, matrices frozen), cached label rect, still halo, `maxFps` setting
  (config, panel "Max frame rate 60 / 30", `?fps=`), the fps line shows the pace (full rate / calm /
  resting). README troubleshooting line for CPU use.
- Numbers (% of one core, renderer + GPU process, 600x1000, default settings), old -> new:
  standby 69 -> 24, idle 78 -> 48, idle after a quiet minute 78 -> 37, busy 158 -> 117.
- Checks: pixel diff old vs new at noon and night (only animated parts differ), settings panel
  screenshot, "30" click saves `maxFps: 30` and survives a restart, no console errors, 98 tests pass.

**Left:** optional GIF (D62).

**Known issues / open questions**
- Numbers come from headless Edge (rAF at 165 Hz, so "60 / 30 / 15" show as ~55 / 33 / 15); a
  real 60 Hz window should draw 60 / 30 / 15. The user's own feel on their laptop is the real test.
- The user's running server (login shortcut) still has the old config validation: restart it, or
  the new frame-rate setting is refused when saved.
- Station meshes are not merged (their parts move and light up one by one).

**Next step:** the user tries it; if the CPU is still high, set Max frame rate 30 / bloom off and
report the fps line from the settings panel.

### 2026-10-09 - Session 7 - Stage 6 (fresh-clone install, shortcuts)
**Done**
- Fresh `git clone` from GitHub into an empty folder, README steps only, against a scratch
  settings file, scratch shortcut folders and port 7862 (the user's settings and server untouched):
  installer diff + "y" + backup, second run changes nothing, hook run in exec form from the
  settings entry (event arrives, no output, silent when the server is down), login shortcut starts
  the server hidden in ~2 s, desktop shortcut starts it and opens the Edge app window, uninstall
  restores the settings byte-exact, removes both shortcuts and stops the server.
- Same in a folder `Kullanıcı Ğüş [x]` (Turkish letters, space, brackets) with Unicode desktop /
  startup folders: found and fixed three bugs (D66): WScript.Shell stored ANSI-mangled paths (the
  shortcut ran nothing, could not even be saved into a Unicode folder, uninstall left it);
  `Start-Process` failed in a `[x]` folder; shortcut errors were silent. Now Shell32 link object
  + an empty 80-byte .lnk, `ProcessStartInfo`, `-LiteralPath`, a message box for any error.
  Shortcuts made by the old version are still removed.
- Installer prints the real monitor URL; README troubleshooting line for the shortcut.
- Tests: 96 pass (PowerShell scripts checked by hand as above).

**Left:** install on another physical Windows machine; a real sign-out / sign-in with the login
shortcut; GIF (optional, D62).

**Known issues / open questions**
- Piping answers into install.ps1 does not work (Node's prompt reads all of stdin); a real console
  is fine. Scripted runs use `-Yes`.
- The installer re-formats the user's settings file in Claude Code's 2-space JSON style (values
  unchanged; the diff shows it).
- The tests opened a few Edge app windows on 127.0.0.1:7862; the user can close them.

**Next step:** `/next` -> stage 6 wrap-up: the user installs on another Windows machine following
only the README (or confirms it is enough); then optional GIF and a v0.1.0 release tag.

### 2026-10-09 - Session 6 - Stage 6 (install, docs, release) + follow-up
**Done**
- Stage 6 (earlier part of the session, ended early): `install.ps1` / `uninstall.ps1` +
  `scripts/setup.js` and pure `hooks-config.js` (diff, "y", backup, byte-exact restore; D58),
  duplicate-event guard `server/dedupe.js` (D59), `POST /shutdown`, `scripts/start.ps1` / `stop.ps1`
  / `shortcut.ps1` (D60), Windows-only note (D61), English README, `docs/HOW-IT-WAS-BUILT.md`.
- Follow-up (user): the "Kod Ocağı" furnace is now the **Code Editor / Kod Editörü** (key `editor`):
  workbench, monitor whose editor writes line by line while Edit/Write run, `</>` sign + front
  emblem, keyboard, rubber duck, floating `{ } ( ) ;` bits (D63).
- Livelier character (`web/scene/life.js`, D64): moves between stands at each spot (desk: keys,
  panels, laptop, thinking spot; editor: keys, step back, duck; board: two places, step back),
  fidgets, small steps when turning, shoulder swing; reactions to a prompt / failure / level up;
  glances at busy stations (Terminal, orbit, portal, racks). Reduced motion turns it off.
- README screenshots retaken from the user's live monitor (real moments, no local paths in the log).
- Privacy check of the public repo (all files + full history): no e-mail, name, local path,
  session id or key; commits use the GitHub no-reply address.
- Tests: 96 pass (new: stands geometry, stand choice, animations/gestures).
- Checks: scratch server 7861 (scratch config/data) in headless Edge at 600x1000, 702x765 @1.5x,
  420x900; day / sunset / night; film strips of idle, edit, read, bash, failure, prompt, stop.

**Left:** desktop / log-in shortcuts not verified; a fresh clone on another Windows machine
(stage 6 "done when") not tried; no GIF, only 3 states pictured (D62).

**Known issues / open questions**
- The original reference image was removed from the repo and its whole git history (user, D65).
- While the character types at the editor its nameplate covers the floating `</>` sign (the front
  emblem stays visible). At the duck stand it briefly hides part of the monitor.
- fps still only measured in headless Edge (35-55).

**Next step:** `/next` -> finish stage 6: install from a fresh clone following only the README
(another folder or machine), check the shortcuts.

### 2026-10-09 - Session 5 - Stage 5 (settings) + redesign
**Done**
- Stage 5: settings panel from the gear (`web/settings.js`): agent name, title, subtitle, language,
  accent colour (presets + any colour), sky, bloom, pixel ratio, context window, time-bar scale.
  `POST /config` (same-origin Origin + header + JSON, all-or-nothing validation, port not editable,
  other keys kept, atomic write) -> `config` broadcast to every tab (D46-D48). Accent re-tints HUD
  tokens and every 3D colour built in the base cyan (D47).
- Redesign 1 (user: "looks like AI slop"): light is information (stations rest dim, light up while
  working), HUD as an instrument (no glow boxes, Bahnschrift small caps, segmented meters, callout
  labels with leader lines, XP ring, skill rail) (D49-D53).
- Redesign 2 (user away, free hand): the sky realm - rock islands over a sea of clouds, sky follows
  the local time (`daylight.js` + `sky.js`), fireflies, shooting star on Stop, storm on StopFailure,
  level-up sparks + banner, nameplate hidden without a character, reduced motion respected (D54,
  D56, D57). Context meter shows real tokens from the session transcript (`server/transcript.js`,
  window auto 200k/1M, tool-call fallback); rack LEDs follow it (D55).
- Tests: 72 pass (config update/save, accent tracking, daylight, transcript/context, state).
- Checks (scratch server 7861 + scratch config/data; test events never sent to the user's server):
  security probes on `/config` (foreign Origin, no header, wrong Host, text/plain, port, bad value);
  17-step two-window browser check (every setting live in the other tab, Enter saves, invalid
  value refused, offline edit saved after reconnect); restart keeps every setting; screenshots of all
  states at night / dawn / noon / sunset / 11:00, 420 / 600 / 702x765 widths, storm, level up,
  shooting star, reduced motion; real transcript of this session read as 573k / 1M.

**Left:** stage 6.

**Known issues / open questions**
- The transcript's JSONL format is not documented and may lag a step; if it cannot be read the
  context meter falls back to tool calls. The context window is not in the transcript: auto =
  200k, or 1M once more is used (the setting can fix it).
- fps measured only in headless Edge (45-55); a check in the user's real browser is still open.
- Permission denied in the dialog still fires no hook ("waiting" stays until the next event).
- Helper bots and real subagents only tested with documented-format fake events.

**Next step:** `/next` -> Stage 6. First tasks: install script (back up `~/.claude/settings.json`, show
the diff, merge hooks only after explicit approval; uninstall restores the backup), then README
with screenshots (day / sunset / night / storm) and the "how it was built" guide.

### 2026-10-09 - Session 4 - Stage 4 (events -> animations)
**Done**
- Verified in the hooks docs: a permission denied in the dialog fires no hook (PermissionDenied is
  auto mode only); SubagentStart/Stop carry `agent_id` and fire for background agents.
- Server: `turnEnded` flag (arcade only after a finished turn), helpers as `{ id, agentType, kind }`,
  SubagentStop ends that helper's open calls, main PreToolUse / Stop / StopFailure end a compaction
  without PostCompact, TodoWrite -> task counts only (`todos`). Tests for each.
- Scene: `director.js` (goals from state + live events; hold 0.7 s, linger 2.5 s), `walk.js`
  (ring + legs, never through the console), `realm.js` eases a `drive` object every frame;
  character rebuilt with hip joints, poses (type, forge + hammer, present, wave, play, slump), walking
  and fade; `helpers.js` bots per subagent; every station reacts (see DESIGN.md section 5); board
  ticker (file / pattern / task chips); rack LEDs from context fill; red alert rims; standby and
  alert via exposure; CSS yellow/red vignette; label step-aside eased. 56 tests pass.
- Checks: scripted session (21 states) as raw hook JSON on a scratch server (port 7861, scratch
  config/data) in headless Edge at 600x1000, 420x900, 702x765 - every state on the right station,
  no stuck states, no console errors, 54-55 fps (headless cap = 60) with 180 draw calls. Live: real
  Read/Grep/Write/Edit/Bash/WebFetch events of this session on the user's server (started for the
  check, stopped after; it added real XP) moved the character and stations as designed.

**Left:** stages 5-6.

**Known issues / open questions**
- Denying a permission fires no hook: "waiting" and that call's station stay on until the next
  clearing event (next PreToolUse, prompt, Stop).
- Helper bots and real subagents were only tested with documented-format fake events, not live.
- Bots can hide behind HTML labels for a moment; the character label covers the board's top.
- `prefers-reduced-motion` is still not applied to the 3D scene (walks, spins).
- fps still measured in headless Edge only; a check in the user's real browser is worth doing.

**Next step:** `/next` -> Stage 5. First tasks: settings panel from the gear icon, a server
endpoint to save config.json (validated, Host/Origin checked), live apply (accent colour re-tints
`theme.css` tokens and the neon materials).

### 2026-10-09 - Session 3 - Stage 3 (static 3D scene)
**Done**
- `npm i three` (r186, MIT); server serves `build/` + `examples/jsm/` under `/vendor/three/`
  (traversal probes -> 404); import map in `index.html`; scene loaded with dynamic `import()` (D25).
- `web/scene/`: `realm.js` (ortho camera 35°/45°, ACES, UnrealBloomPass + OutputPass, fog, loop
  with ~60 fps cap, pause when hidden, framing into the free HUD area), `world.js` (5 chamfered
  platforms with neon rims and slit lights, pipes, cables, sky gradient, haze, dust, glyph columns,
  lights, procedural neon environment map), `props.js` (all 9 stations + decor, ambient motion),
  `character.js` (chibi from primitives), `kit.js` (cached materials, canvas textures, helpers).
  `web/palette.js` mirrors theme.css. Nothing downloaded besides three.js.
- `web/labels.js`: station + character labels follow 3D anchors, shrink with the scene, step aside
  when they overlap (D27, D28). Gear menu: bloom on/off, pixel ratio 1/1.5/2, measured fps + draw
  calls. Config keys `bloom`, `pixelRatioCap` (+ tests). Station label test. 39 tests pass.
- User feedback applied: overlapping labels in a ~700x765 window (scaling + collision + bigger
  scene in short windows, D28/D29); Turkish name "Kod Ocağı" (D34); the rings station is now
  "Terminal" in both languages and stays the station for every Bash/PowerShell call (D35).
- Checks (scratch server on port 7861 + scratch config/data; test events only there): screenshots at
  420x900, 520x960, 600x1000, 702x765 @1.5x, 960x1040, 1280x720; working / compacting / helper /
  web states show the right labels; no-WebGL fallback (`--disable-webgl`); draw calls counted by
  hooking WebGL: ~11,600/s visible, 0 while hidden, resumes when shown; fps on Intel UHD (headless
  Edge, rAF 165 Hz, so the cap shows as 55 = 60 on a real screen): default settings at the cap for
  DPR 1, 1.25, 1.5 and 2; pixel ratio 2 + bloom on a DPR 2 screen = 42 fps.

**Left:** stages 4-6.

**Known issues / open questions**
- fps numbers come from headless Edge, not a real window; a check in the user's real browser is
  still worth doing (gear menu shows fps).
- Labels step aside greedily each frame; once the character moves (stage 4) they may jump between
  positions and might need smoothing.
- The lower data-fall basin can sit partly behind the Hook Flow panel (by design, D29).
- `prefers-reduced-motion` is not applied to the 3D ambient loops yet.
- First load logs a harmless D3D shader compiler warning (X4122) from ANGLE.

**Next step:** `/next` -> Stage 4. First tasks: a client-side scene state fed by the server snapshot, character walking/turning between stations,
and the event -> reaction table rows one by one (rack LEDs from context fill, falls speed from
activity rate).


### 2026-10-09 - Session 2 - Stage 2 (HUD layout, palette, real data)
**Done**
- Verified against the hooks docs: `effort.level` values, `agent_id` only inside subagents,
  SessionStart sources (incl. `fork`), PermissionRequest has **no** `tool_use_id`, Stop does
  **not** fire on a user interrupt.
- Server: `server/config.js` (config.json + defaults + validation), `server/state.js` (session state
  machine, focus session, level curve), `server/stats.js` (XP file, debounced atomic writes),
  `GET /state`, state snapshot sent with `hello` and every `event`. Hook reads the port from
  config.json when env `AGENT_OFFICE_PORT` is not set.
- Web: stage 1 list moved to `debug.html` (+ server state box); new HUD `index.html`, `hud.css`,
  `theme.css`, `i18n.js` (tr/en), `narrate.js` (event -> sentence), `stations.js`, `ws.js`, favicon.
- Tests: 38 pass (state machine, config/stats, i18n keys + every event's log line in both languages).
- Checks (test server on another port + scratch config/data, never the user's server):
  screenshots at 600x1000, 520 and 420 px wide; working / permission waiting / idle / error /
  ended / two sessions / empty states; settings menu + TR<->EN switch by real clicks over the
  DevTools protocol (no console errors); XP survives a restart; custom title renders Turkish
  uppercase correctly; hook port lookup from config.json; live check with this session's real
  events (effort `xhigh`, project, running command, "≥" lower bounds) via `/state` and screenshot.

- Follow-up (user): banner default is now "agent-office-3d", agent name "Claude"; the "Siber Diyar /
  Cyber-Realm" name is gone (D23).
- Published (user): public repo https://github.com/ozyusuf/agent-office-3d, MIT license, short
  README (work in progress). Commit author email = GitHub no-reply address (D24).

**Left:** stages 3-6.

**Known issues / open questions**
- Denying a permission or pressing Esc may fire no hook at all, so "waiting for permission" can stay
  until the next prompt. (An interrupted tool does fire PostToolUseFailure with `is_interrupt`,
  which ends the turn.)
- A long custom realm title squeezes the stats panel at ~600 px width (text is clipped, not broken).
- The language button in the gear menu only applies to that tab; the saved default is config.json
  (full settings panel = stage 5).
- Piping an event into the hook from Git Bash did not reach the server; from PowerShell (and from
  Claude Code) it works. Use PowerShell for manual hook tests.
- The middle of the HUD is empty until the 3D scene arrives; only 3 station labels are shown (D21).

**Next step:** `/next` -> Stage 3. First tasks: `npm i three`, serve it under `/vendor/three/` with an import map, renderer with pixel-ratio cap + pause when hidden,
orthographic isometric camera, then platforms and stations from primitives.


### 2026-10-09 - Session 1 - Stage 0 (docs) + Stage 1 (hook -> server -> list)
**Done**
- Saved the target image to the repo (removed later from the repo and its history, D65).
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
