# How agent-office-3d was built

agent-office-3d was built in one day (2026-10-09) by Claude Code, working in VS Code, with one
person directing it. That person set the goal, looked at the screen after every stage and gave
feedback in plain words; they did not review the code. This guide explains the working method, the
architecture and the decisions that shaped it, so you can reuse what worked.

The raw material is in this repo: [PLAN.md](PLAN.md) (stages and checkboxes),
[PROGRESS.md](PROGRESS.md) (one entry per session), [DECISIONS.md](DECISIONS.md) (D1-D64, each with
its reason) and [DESIGN.md](DESIGN.md) (the look). Decision numbers below (D3, D55, ...) point there.

## 1. The working method

### Five documents and two commands

| File | Role |
|---|---|
| `CLAUDE.md` | Hard rules, read by Claude Code at the start of every session (max ~60 lines) |
| `docs/PLAN.md` | Six stages; each has checkbox tasks and a **"Done when"** sentence |
| `docs/DESIGN.md` | Source of truth for the look: palette, layout, scene objects, event -> reaction table |
| `docs/DECISIONS.md` | Every non-obvious choice: what, and why. Numbered, never deleted, only replaced |
| `docs/PROGRESS.md` | Session log: done, left, known issues, next step |

Two project slash commands drive the rhythm (`.claude/commands/`):

- **`/next`** reads PROGRESS and PLAN, finds the first stage with open boxes, says in two sentences
  what it will build, builds it, stops when the stage's "Done when" holds, and explains how to try it.
- **`/wrap`** writes the session into PROGRESS, ticks only the tested boxes in PLAN, records new
  decisions, runs the tests, commits and pushes.

Because every session starts by reading the same files, a new session (or a new context after
compaction) picks up exactly where the last one stopped. This turned out to matter more than any
single technical choice.

### Rules that kept it honest

These lines in `CLAUDE.md` did most of the steering:

- **"Never show made-up data. Every number and bar on screen must come from a real hook event."**
  This killed a lot of tempting decoration. The context meter first counted tool calls against an
  arbitrary 150; later it was replaced by the real token count from the transcript (D55). Unknown
  values are shown as unknown ("–", "≥" for lower bounds, "waiting for events") (D16).
- **"Never guess hook field names or settings format: verify against the docs."** Several facts
  below were found this way, and some surprised us.
- **"Never touch `~/.claude/settings.json` without a backup and the user's explicit approval."**
  During development the hooks lived in the repo's `.claude/settings.json`; only the stage 6
  installer touches the user file, and only after showing a diff and getting a "y".
- **"Never send test events to the server the user watches."** Every check ran on a second
  server with scratch config and data (`AGENT_OFFICE_PORT`, `AGENT_OFFICE_CONFIG`,
  `AGENT_OFFICE_DATA`).
- **"Finish one stage, then stop."** The person saw every stage before the next one began, so
  feedback landed while it was still cheap to act on.

### How feedback changed the design

The most valuable moments were short remarks after looking at the screen:

- *"Things pile up on top of each other in my ~700x765 window."* -> labels shrink with the scene and
  step aside when they overlap (D28), the camera framing got explicit limits (D29).
- *"'Kod Ergitme' is unclear"*, *"call the rings station Terminal"* -> naming decisions (D34, D35).
- *"It looks a bit like AI slop."* -> a full redesign (D49-D53): light became information (a station
  glows only while it works), the HUD lost its glass boxes and glowing borders and became a quiet
  instrument (hairlines, small caps, tabular numbers, one accent colour).
- *"Design something you would like yourself"* (free hand while the person was away) -> the sky
  realm: rock islands over a sea of clouds, a sky that follows the local clock, weather on errors
  (D54-D57).
- *"The code furnace does not make me think of code"* and *"the character mostly just stands in the
  middle of a station"* -> the furnace became a Code Editor (monitor writing code, `</>` sign, a
  rubber duck; D63), and the character got a life of its own within each spot (D64).

## 2. Architecture

```
Claude Code hooks -> hooks/send-event.ps1 -> POST /event -> Node server -> WebSocket -> three.js page
                                              (127.0.0.1)    (state)                     (HUD + scene)
```

### The hook: invisible and harmless

- Command hooks with `"async": true` (D1): Claude Code starts the process and moves on; it never
  waits for the monitor.
- Exec form (`"command": "powershell.exe"`, `"args": [...]`) with `-NoProfile -NonInteractive
  -ExecutionPolicy Bypass` (D2): no shell parsing, fast start, no profile output.
- The script forwards **raw stdin bytes** and parses nothing (D4). That keeps UTF-8 intact on
  Windows PowerShell 5.1 and means schema changes only touch the server.
- It talks raw HTTP over a `TcpClient` with a 300 ms connect timeout (D5): a refused localhost
  connection on Windows can otherwise take seconds, and `HttpWebRequest` would try proxy detection.
  It prints nothing and always exits 0.

### The server: one source of truth

- **Ordering (D3).** Async hook processes finish in random order. Each hook sends its own process
  start time (`X-Hook-Ts`); the server holds events for 350 ms and releases them sorted by that time.
- **Pairing.** PreToolUse is paired with PostToolUse or PostToolUseFailure by `tool_use_id`, so a
  late or lost event can never leave a station stuck "on". More safety nets in D40.
- **State lives on the server** (D15): `server/state.js` is a plain, unit-tested state machine; the
  page only renders its snapshot. XP is the count of finished tool calls, stored in `data/stats.json`.
- **Context size from the transcript** (D55): every hook event names the session transcript. The
  server reads only the end of that JSONL file and takes the last API call's token usage. The format
  is not documented, so it is best effort with a fallback.
- **Security** (D6, D46): bound to 127.0.0.1; `Host` checked on every request (DNS rebinding);
  `Origin` checked on the WebSocket; `POST /event` needs a custom header and no `Origin`, so a web
  page cannot inject events (the header would need a CORS preflight that is never answered). Only
  small display events leave the server: tool name, file name, first line of a command (D7).
- **Duplicates** (D59): after installing, a project that also registers the hook could run it twice
  for one event; the server drops a second copy with the same body fired within 2 s.

### The page: no build step

- Plain ES modules, no framework, no bundler. three.js is served from `node_modules` through an
  import map (D25), so it works offline. The scene is loaded with a dynamic `import()`, so the HUD
  still works when WebGL does not.
- Everything in 3D is built from primitives in code; nothing was downloaded (fonts are system
  fonts: Bahnschrift and Consolas ship with Windows).
- **Pure decisions, eased values** (D36): `director.js` decides what should happen (which station,
  where the character goes) and `walk.js` where it may walk; both are pure and tested in node.
  `realm.js` eases a shared `drive` object towards those goals every frame; stations only read it.
- **Display timings are not data** (D38): real tool calls often last 50 ms, so every call lights its
  station for at least 0.7 s and the character lingers 2.5 s before walking back. Nothing is shown
  that did not happen; it is just held long enough to be seen.
- **Where vs. how** (D64): the events decide *where* the character is; *how* it spends the time
  there (moving between a few stands, fidgets, glances at busy stations) is decoration in `life.js`,
  so the character never freezes in the middle of a station without inventing any session data.
- **Performance** (D31, D67): pixel ratio cap, no shadows, instanced meshes, the loop stops while the
  tab is hidden, bloom can be turned off. Measured on an Intel UHD iGPU. Later a measuring harness
  (headless Edge driven over the DevTools protocol, CPU time per browser process) showed the real
  costs: a monitor that is always visible should draw only the frames its motion needs (60 / 30 /
  15 fps by what moves), three.js draws transparent double-sided materials twice and re-checks their
  shaders every frame, and one endless CSS animation keeps the browser composing at the screen rate.

## 3. The stages

| Stage | What was built | Notable |
|---|---|---|
| 0 | Docs, rules, plan, palette measured from a reference image | Palette from a pixel histogram, not by eye (D10) |
| 1 | Hook -> server -> plain event list | Order restored by process start time; 4 hooks 15 ms apart arrive in order |
| 2 | HUD layout, i18n (en/tr), server-side state, XP | Unknown shown as unknown (D16) |
| 3 | Static 3D scene from primitives, labels, bloom | Camera framing for a portrait window (D29) |
| 4 | Events drive the scene | Director/drive split (D36), safety nets against stuck states (D40) |
| 5 | Settings panel, live re-tint of accent colour | All-or-nothing validation, atomic writes (D46, D47) |
| Redesign | "Light is information", the sky realm, real context tokens | D49-D57 |
| 6 | Installer, uninstaller, shortcuts, README, this guide | Diff + backup + explicit "y" (D58) |
| 7 | Performance: frame pacing, fewer draw calls, frame-rate setting | Measured first, CPU -35 to -65 % (D67) |

## 4. Facts about Claude Code hooks that we verified

Checked against the [hooks documentation](https://code.claude.com/docs/en/hooks) and live events
(Claude Code 2.1.x, Windows):

- A failed or interrupted tool fires **PostToolUseFailure instead of PostToolUse**. Without that
  event a station would stay lit forever (D13).
- **PermissionRequest has no `tool_use_id`**; it is paired with the latest running call of the same
  tool (D18). A permission **denied** in the dialog fires **no hook at all**, so "waiting" stays until
  the next event (a known limitation, D40).
- **Stop does not fire when the user interrupts**; the interrupted tool's PostToolUseFailure carries
  `is_interrupt` and ends the turn (D18).
- SubagentStart/SubagentStop carry an `agent_id`; events from inside a subagent carry it too, which
  is how helper calls are told apart from the main agent's.
- Hooks edited in a settings file are picked up by a running session without a restart.
- Hooks from user, project and local settings are merged; a handler defined in more than one file
  "runs once", but the docs do not say how handlers are compared, so the server de-duplicates too.
- `transcript_path` is a documented field, the transcript's JSONL format is not.

## 5. Testing without a human reviewer

- **Unit tests** (`npm test`, node:test, no dependencies): normalisation, the state machine, config
  validation, the sky keyframes, the director, transcript parsing, the installer's settings merge
  and diff, the duplicate filter.
- **A scratch server** for anything end-to-end, with its own port, config and data, so test events
  never reach the monitor the person is watching.
- **Headless Edge over the DevTools protocol** for screenshots at several window sizes and sky
  hours, fps and draw-call counts, and two-tab checks of live settings. The screenshots in the
  README were taken from the person's real monitor while this guide was being written, so the
  scene shows real work: the `?hour=` URL parameter only changes the sky for that tab.
- **A fresh copy of the repo** for the installer: installed into a scratch settings file and
  scratch shortcut folders, hook fired exactly as written into the settings, then uninstalled and
  compared byte for byte with the original.

## 6. If you build something similar

- Write the rules down before the first line of code, and make "no fake data" one of them.
- Give each stage a "Done when" that can be checked by looking at the screen.
- Keep a decisions log with reasons. It is what lets a fresh session avoid re-arguing old choices.
- Keep the hook dumb and the server smart; never let a monitor slow down the thing it monitors.
- Split pure logic from rendering; it is the part you can test without eyes.
- Show the result to a human after every stage. One honest sentence ("looks like AI slop") is worth
  more than any checklist.
