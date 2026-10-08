# Decisions

Newest at the bottom. Format: date - decision - why.

## 2026-10-09 - Stage 0/1

**D1. Hooks run as `async: true` command hooks.**
Claude Code must never wait for the visualiser. With `async`, Claude starts the hook process and
continues immediately; output (we print none) would only be delivered on the next turn.
Trade-off: hook processes run in parallel, so events can arrive out of order (see D3), and a
`SessionEnd` hook may be cut off if Claude Code exits first.

**D2. Exec form: `"command": "powershell.exe"` + `args: [-NoProfile, -NonInteractive, -ExecutionPolicy, Bypass, -File, ${CLAUDE_PROJECT_DIR}/hooks/send-event.ps1]`.**
This is the documented Windows PowerShell pattern. No shell parsing, path placeholder passed as one
argument, `-ExecutionPolicy Bypass` avoids script-policy failures, `-NoProfile` keeps startup fast and
stops user profiles from printing anything. Windows PowerShell 5.1 is used because it ships with
Windows 11 (`pwsh` is not installed here); the script is 5.1-compatible.

**D3. Ordering by hook process start time + a short reorder buffer on the server.**
The hook sends its own process start time in the `X-Hook-Ts` header. The server holds each event
for ~350 ms and releases them sorted by that time (ties by arrival). Process start order equals the
order Claude Code fired the hooks, while PowerShell startup time varies. Stage 4 also pairs
Pre/Post events by `tool_use_id`, so a late event can never leave a station stuck.

**D4. The hook forwards raw stdin bytes; the server does all parsing.**
No `ConvertFrom-Json` in PowerShell: faster, no 5.1 encoding issues (stdin is read as bytes, not
through the OEM console code page, so Turkish characters survive), no size limits. The hook does not
need to know the event schema, so schema changes only touch `server/normalize.js`.

**D5. Raw TCP + hand-written HTTP/1.1 POST in the hook, 300 ms connect timeout.**
On Windows a refused localhost connection can take ~1-2 s (SYN retries); `HttpWebRequest` would
also try proxy auto-detection. A TcpClient with a short connect wait exits fast when the server is
down. The script wraps everything in try/catch, writes nothing to stdout and always exits 0.

**D6. Server security: bind 127.0.0.1, check `Host` on every request, check `Origin` on WebSocket
upgrades, require `X-Agent-Office: 1` and no `Origin` on `POST /event`.**
Events contain file paths and prompt snippets. Host checks block DNS rebinding; Origin checks stop
other websites from reading the WebSocket; the custom header forces a CORS preflight (which we never
answer), so a web page cannot inject fake events.

**D7. Only small display events leave the server.** `normalize.js` drops `tool_response`, file contents,
`last_assistant_message`, `compact_summary`; keeps tool name, a short target (file name, pattern,
first line of a command, URL host), duration and event-specific small fields. The prompt is kept only
as a 120-char preview for the debug view.

**D8. Port 7847, overridable with env `AGENT_OFFICE_PORT`** (read by both server and hook script).
A settings file comes in stage 2/5.

**D9. Dev hooks live in the committed project `.claude/settings.json`.** As the user asked. The user's
global `~/.claude/settings.json` is only changed by the stage-6 install script, with a backup and
explicit approval.

**D10. Palette measured from the reference image** with a small PNG decoder + hue-bucket histogram
instead of eyeballing. Values not present in the image (red alert, text colours) are marked "derived"
in DESIGN.md.

**D11. Default realm subtitle = current project folder name (from the event `cwd`).**
Real data instead of a fixed string; overridable in settings.

**D12. The stage 1 list stays as a permanent debug view.** It lives at `web/index.html` for now and
moves to `web/debug.html` in stage 2, so raw events can always be inspected next to the 3D screen.
It is the only place that shows a prompt preview.

**D13. `PostToolUseFailure` added as the 13th hooked event (user approved, 2026-10-09).**
A failed or interrupted tool call fires `PostToolUseFailure` instead of `PostToolUse` (seen live: a
Bash call that exited with code 2 never got a PostToolUse). Without it a station could stay "active"
forever. Kept fields: one-line `error`, `tool_error.type` as `errorType`, `is_interrupt` as
`interrupted`, `duration_ms`. Failed calls count towards context fill and XP like successful ones.

## 2026-10-09 - Stage 2

**D14. Settings = optional `config.json` (gitignored) + defaults in code (`server/config.js`).**
Every key is validated; a bad value falls back to its default with a console warning instead of
crashing. Port order is env `AGENT_OFFICE_PORT` > config.json > 7847, in both the server and the hook.
The hook finds the port with a regex on config.json (no `ConvertFrom-Json`, stays fast; D4).
Env `AGENT_OFFICE_CONFIG` / `AGENT_OFFICE_DATA` let tests run a second server with scratch files,
so test events never reach the server the user is watching.

**D15. The session state lives on the server (`server/state.js`); browsers only render it.**
The snapshot goes out with `hello` and with every `event`, and `GET /state` returns it for checks.
One source of truth, unit-testable without a browser, and stage 3/4 reuse the same state.
The focus session is the one with the most recent event (DESIGN.md).

**D16. Unknown is shown as unknown.** If the server joins a session late (no SessionStart seen, or
resume/fork), time and context are flagged as lower bounds and shown with "≥". A missing effort level
shows "–". Before the first event the panels say "waiting for events" and draw no bars.

**D17. Context fill counts only the main agent's finished tool calls; XP counts all of them.**
Subagents work in their own context window, so their calls do not fill the main one, but they are
still work done.

**D18. Permission pairing.** PermissionRequest has no `tool_use_id` (hooks docs), so it is paired with
the latest running call of the same tool and cleared by that call's PostToolUse/Failure, the next
PreToolUse, a new prompt, Stop/StopFailure or SessionEnd. If it arrives before its own PreToolUse
it is paired, not cleared. An interrupted tool (`is_interrupt`) ends the turn, because Stop does not
fire on a user interrupt (hooks docs).

**D19. PostToolUse adds no Hook Flow line** (the skill dims instead), so the log reads as one
sentence per action. Failures, interrupts and every other event do get a line. Calls made inside a
subagent are marked "↳"; with more than one session in the log every line gets a 4-character
session tag.

**D20. Stage 2 language switch = small gear menu, per tab only.** The saved default comes from
config.json; `?lang=en|tr` also works in the URL. Writing settings from the browser is stage 5.

**D21. Only three station labels in stage 2** (Code Smelter, Vision & Task Board, Test Centrifuge,
as in the reference) at fixed positions; the other stations have hidden label slots. Stage 3 decides
which labels to show once they are projected from the 3D stations.

**D22. HUD details that differ from the first DESIGN.md draft:** Grep's dot is green (as in the
reference image, not purple-blue); Turkish skill labels are words (Oku, Ara, Düzenle, Komut, Web,
İzin); the stats meters are stacked (label + value, bar below) because the top-left column is only
~175 px wide at 600 px; an empty realm title means a default title (changed by D23); the level ring is decoration, the XP bar under the name is the data.
System fonts only for now (Bahnschrift, Consolas), so nothing is downloaded.

**D23. Default banner title = "agent-office-3d"; default agent name = "Claude" (user, 2026-10-09).**
Replaces the translated "Cyber-Realm" / "Siber Diyar" default from D22. The title and the name in the
reference image are only examples and are not used anywhere. The subtitle (project folder) is
hidden when it equals the title, so working in this repo does not show "AGENT-OFFICE-3D" twice.

**D24. Public GitHub repo, MIT license, no-reply commit email (user, 2026-10-09).**
The user wants anyone to be able to use the project, so it is public under MIT (permissive, the
most common choice). Commits use the GitHub no-reply address (set in this repo's git config; the two
earlier commits were rewritten before the first push) so the personal email is not published.
Replaces "choose a license in stage 6" in PLAN.md.

## 2026-10-09 - Stage 3

**D25. three.js (r186, MIT) is served from `node_modules` under `/vendor/three/`, via an import map.**
No bundler and no CDN, so the page works offline. Only `.js` files inside `build/` and
`examples/jsm/` are reachable (path traversal returns 404). `app.js` loads the scene with a dynamic
`import()`, so the HUD still works when WebGL or three.js fails; labels then fall back to the
stage 2 slots and the gear menu says the 3D scene is unavailable.

**D26. Layers: 3D canvas -> label layer -> frame -> HUD panels.** Labels live in their own
full-window layer under the HUD, so the glass panels cover a label that drifts behind them.

**D27. Station label visibility (replaces D21).** Always: Code Smelter, Vision & Task Board, Test
Centrifuge (as in the reference). Only while active: Orbit Sphere, Server Racks, Portal Ring,
Arcade. Never: the desk (the character label is above it) and the data falls (no event drives them).
Showing all nine at once crowds a narrow window.

**D28. Labels shrink with the scene and step aside when they overlap (user feedback: things were
piled on top of each other in a ~700x765 window).** Scale = scene px-per-unit / 40, clamped to
0.7-1. Overlaps are resolved greedily, the shortest of up/down/left/right; priority: character
label, then active stations, then idle ones.

**D29. Camera framing:** the main platform takes at most 78 % of the free middle area's width, and
the span from the big portal down to the lower data-fall basin at most its height (plus 14 px above
and 28 px below, behind the glass). Side platforms may run off the edges, as in the reference.
Windows under 820 px tall show 4 Hook Flow lines instead of 6 so the scene gets more room.

**D30. The command desk is a ring console open towards the camera.** With a closed arc in front,
the 35° view hid everything below the character's eyes. The holo keyboard floats in the opening.

**D31. Performance choices (measured on this machine's Intel UHD, headless Edge with GPU):**
no shadows; MSAA on the bloom render target only below pixel ratio 1.5 (4x MSAA on a HalfFloat
target at 1.5x dropped 55 -> 40 fps; without it the default settings run at the frame cap); frames
closer than 1000/75 ms are skipped (a 1000/62 cap dropped frames on 60 Hz screens because of jitter).
Skin and hair get a little emissive so the character reads under the cyan lights.

**D32. 3D quality settings: `bloom` (default true) and `pixelRatioCap` (default 1.5) in
config.json;** the gear menu (and `?bloom=0|1&pr=1|1.5|2`) overrides them for one tab, like the
language (D20). The menu also shows the measured fps and draw calls. Stage 5 makes them editable.

**D33. Decoration is not data.** The board's "code" is coloured bars only (no characters or
numbers); rack LEDs stay unlit until stage 4 lights them by context fill; ambient loops (flames,
falls, rings, dust) carry no meaning until stage 4 ties them to events.

**D34. Turkish station names (user, 2026-10-09):** smelter = "Kod Ocağı" ("Kod Ergitme" was
unclear), centrifuge = "Test Laboratuvarı" ("Test Sınama" repeats itself; the user wants a
test-related name, "Komut Çarkı" was rejected). English names unchanged.

**D35. The rings station is called "Terminal" in both languages (user, 2026-10-09).** It reacts to
every Bash/PowerShell call (npm, git, tests, ...), not only to tests, so the name stays general.
Replaces the centrifuge names in D34 ("Test Laboratuvarı") and "Test Centrifuge"; the internal key
stays `centrifuge`. Test commands are not routed to a separate station.
