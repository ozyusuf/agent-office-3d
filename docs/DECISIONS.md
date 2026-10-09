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

## 2026-10-09 - Stage 4

**D36. Scene logic is split into pure decisions and eased drive values.** `director.js` (what should
happen) and `walk.js` (where the character may walk) have no three.js and are unit-tested in node;
`realm.js` eases a shared `drive` object towards the director's goals every frame and the stations,
character and bots only read `drive`. The server stays the single source of truth (D15); the scene
is a function of its snapshot plus short reactions to live events (not to replayed history).

**D37. The character follows only the main agent and walks only to the Smelter and the Board.**
Bash, web and other tools are worked from the desk (the Terminal and the Orbit Sphere are on other
platforms; walking there would be long and hide the character); those stations react on their own.
Subagent calls are shown by helper bots, not by the character.

**D38. Display timings: every PreToolUse lights its station for at least 0.7 s, the character
stays at a work station 2.5 s after the call ends, walks take ~1.2 s.** Real calls often last 50 ms
and Pre/Post arrive in the same 350 ms flush (D3), so without a hold nothing would be seen; the
linger stops the character running back and forth between calls. These are animation times, not
data: no state is invented and nothing stays on after the hold ends.

**D39. `turnEnded` in the server state:** set by Stop, StopFailure and interrupts, cleared by a
prompt, SessionStart or a main-agent PreToolUse. The character plays at the arcade (and the Arcade
label shows) only after a finished turn; a fresh session waits at the desk (DESIGN: SessionStart
"appears at desk", Stop "walks to the arcade"). Replaces "arcade = any idle state" (D27 table).

**D40. Safety nets against stuck states:** a main-agent PreToolUse, Stop or StopFailure ends a
compaction without PostCompact (PreCompact can be blocked); SubagentStop ends that helper's open
calls. A permission denied in the dialog fires no hook at all (hooks docs), so it is left as a known
limitation instead of being guessed with a timeout.

**D41. Power and alert dim the whole scene through the tone-mapping exposure** (one value, works
with bloom on and off): standby before the first event and after SessionEnd (character hidden),
"lights out" on StopFailure with an additive red overlay on every platform rim. The permission and
error tints are a CSS vignette layer between the canvas and the labels (plus a yellow desk light).

**D42. The board's ticker shows real values only:** the file name, the search pattern, or one chip
per TodoWrite task (normalize.js sends counts `{ total, done, doing }`, never the task text). It runs
along the board's bottom, repeated, because the character label covers the top.

**D43. Materials that change at runtime are owned** (`neon(..., { own: true })`); cached ones are
shared across the scene. The character clones its materials so it can fade without fading the desk.

**D44. Activity rate = events of all sessions in the last 60 s** (falls 0.3x idle up to ~3.8x at 40
per minute); rack LEDs lit = context / `contextBarMax` x 144, bottom row first.

**D45. Label step-aside is eased (0.12 s)** so labels glide while the character walks past (stage 3
known issue). The decor box moved to (3.1, -1.1) to clear the walk to the board.

## 2026-10-09 - Stage 5

**D46. Settings are saved through `POST /config` and pushed to every open page.**
Only our own page may write: the request needs a same-origin `Origin`, the `X-Agent-Office: 1` header
and a JSON body (a foreign page cannot send that Origin, and its custom header would need a CORS
preflight that we never answer; Host is checked as everywhere, D6). Unlike config.json at start-up
(D14), an update is all or nothing: an unknown key or a bad value refuses the whole update with a
400 and the reason. The port is not editable (the hook script and the listening server read it at
start). The server keeps every other key of config.json, writes atomically (temp file + rename),
moves a file that is not a JSON object aside instead of overwriting it, and broadcasts
`{ type: 'config' }` so every tab applies the change at once.

**D47. Accent colour = config `accentColor` (default the measured cyan `#33b7de`).** It replaces
`--neon-cyan`; `--neon-cyan-soft` becomes the accent with 15 % white (the measured pair is kept
for the default). In 3D, the scene is built in the base cyan; `trackAccent()` records every material
colour, emissive, light and vertex colour that is the base cyan (or soft cyan) times an intensity
and `setAccent()` recolours them; glows set every frame go through `live()`. Objects built later
(helper bots) are tracked when they are made. The reflection map is rebuilt 250 ms after the
colour settles. Decorative screen textures (board "code", planet) keep their own colours.

**D48. The settings panel replaces the per-tab gear menu (D20, D32).** Every change is saved and
applies to all open tabs. URL parameters (`?lang`, `?bloom`, `?pr`) stay as per-tab overrides and are
dropped when that setting is changed in the panel. Edits show at once (a local draft over the
server's config) and are saved after 450 ms, on Enter, on blur or when the panel closes; if the
server is away the draft stays on screen and is sent again after the reconnect. The time-bar scale
(`sessionBarMinutes`) is in the panel too: it is the same kind of setting as the context-bar scale.

## 2026-10-09 - Redesign (user request after stage 5)

**D49. The look is redesigned freely; the reference image now gives only the content and placement.**
The user found the stage 2-5 look generic ("a bit like AI slop") and asked for a design of my own.
`docs/DESIGN.md` is the source of truth for the look; the reference image still described which
stations exist and where they stand (until D65). Replaces "match the reference layout" for the HUD (D22).

**D50. Light is information.** Station neon rests dim, below the bloom threshold (`REST` 0.3 or
less, `lamp()` / `brighten()` in kit.js), and lights up while the station works; platform rims are
thin accent lines; station point lights pool only where work happens; the data falls' brightness
follows the activity rate as their speed does; a finished turn lowers the exposure by 16 %. Before,
everything glowed at once in cyan, magenta and yellow, so the active station did not stand out.
Bloom: strength 0.75, radius 0.5, threshold 0.85, so only working stations bloom.

**D51. The HUD is an instrument, not a costume.** No glass boxes, glowing borders or angled plates:
the scene runs full-bleed and two edge scrims keep the text legible. Bahnschrift (a DIN face that
ships with Windows, so nothing is downloaded) in tracked small caps, tabular numbers, warm "bone"
text (`#ece8df`) over the cool scene, hairlines, one accent; station colours appear only while that
station works. The effort meter has 5 cells (its 5 real steps), the context meter 30 cells, the time
meter is a line. The session state is text in the header; the level badge shows XP progress as a ring.
Tool lines in the log are marked with their station's colour.

**D52. Station labels are callouts with leader lines.** A label floats 16 px (scaled) above its
anchor and a hairline with a dot joins them, like a callout on a technical drawing; when a label
steps aside (D28) its leader follows. Labels stay inside the free middle area, because there are no
glass panels to hide them behind any more (replaces D26's "the glass covers them").

**D53. Colour roles in the scene.** Platform rims are all accent (no magenta rims); magenta is kept
for helpers (portal) and the arcade; the Terminal's rings are warm (orange, accent, yellow) because
shell = yellow in the HUD; warm "practical" lights (the desk lamp `#ffc48a`, the slit lights under
the rims) against cool moonlight. The default title "agent-office-3d" is uppercased as English (no
Turkish dotted İ); a custom title follows the page language.

## 2026-10-09 - The sky realm (user away, free hand)

**D54. The realm floats above a sea of clouds and keeps the viewer's local time.** The user asked for
something original that I would design for myself. The platforms now float on flat-shaded rock
islands (the stilts and the stacks that rose into a void are gone) over a sea of cumulus puffs;
the sky follows the local clock (`daylight.js`, pure and tested): dawn glow, a bright day, a warm
sunset, moon and stars at night, fireflies after dark. The ambient lights, the key light's direction
(from the sun or moon), the reflections and the HUD's edge scrims follow the same time. The clock is
decoration input, not session data; the setting `sky` (clock / dawn / day / dusk / night) and the URL
`?hour=` fix the time. The camera is orthographic, so the sky is a gradient plane riding with the
camera and the far clouds fade into its horizon band; everything shares one tone mapping. Daytime
clouds stay under the bloom threshold (otherwise the glow washes the view white) and the fog only
reaches what is far behind or deep below the islands. The old purple haze, dust and "falling
glyph" columns are removed.

**D55. The context meter shows real tokens, read from the session transcript.** It used to count
tool calls against an arbitrary 150. `transcript_path` is a documented common hook field; the file's
JSONL format is not documented and may lag, so `server/transcript.js` is best effort: it reads only
the end of the file (512 KB, then 4 MB) and takes the newest of (a) the main thread's last API call
(`input + cache writes + cache reads + output` tokens; subagent "sidechain" and synthetic messages
are skipped) or (b) the last `compact_boundary` (`postTokens`). Checked against a real transcript:
the sum just before a compaction (972,220) matches its `preTokens` (978,681). Only the number leaves
the server. The window is not in the transcript, so the setting `contextWindow` decides: auto =
200k, or 1M once more than 200k is in use (the two Claude window sizes), or a fixed number. Until
the transcript can be read, the old tool-call fallback is shown. The rack LEDs follow the same fill.
Reads are debounced (0.5 s after an event, again 2.5 s later because the file lags) and pushed with
a `state` message. In the settings panel the context window replaces the tool-call scale.

**D56. Celebrations come from real events.** A level up (the XP of finished tool calls crossed a
level) throws gold sparks out of the character, sends a ring over the dais and shows a short
"Level up · LV n" banner; a finished turn (Stop) draws a shooting star when the stars are out. The
nameplate is hidden while there is no character (standby, session over) instead of floating over
an empty desk.

**D57. An API error is a storm; reduced motion is respected in 3D.** StopFailure already meant
"lights out" and red rims; in a sky realm its natural form is weather: the clouds and the sky
darken, rain falls, and a soft lightning flash comes every 3-8 s (exposure x1.8 at most, never a
white frame). With `prefers-reduced-motion: reduce` the scene keeps still where it can: the clouds
do not drift, stars do not twinkle, there are no shooting stars, lightning or level-up sparks (the
ring of light stays). Closes the stage 3/4 known issue about reduced motion in the 3D scene.

## 2026-10-09 - Stage 6

**D58. The installer never changes the user's settings without a diff, a "y" and a backup; the
settings work is done in Node.** `install.ps1` checks Node.js, runs `npm install`, offers shortcuts
and starts the server; the settings file is handled by `scripts/setup.js` with the pure, tested
`scripts/hooks-config.js`, because Windows PowerShell 5.1's `ConvertTo-Json` reformats and escapes
the file (and silently truncates below `-Depth`), while Node keeps keys, order and values. The
file's indent, line ends, final newline and BOM are kept. The user-level hook is the project's exec
form (D2) with the script's absolute path (`${CLAUDE_PROJECT_DIR}` would point at whatever project
is open): one group without a matcher is appended per event, other hooks are not touched, an exact
handler of ours stays where it is (re-running changes nothing), and a handler that runs a
`...\hooks\send-event.ps1` that no longer exists (a moved clone) is replaced. File:
`%CLAUDE_CONFIG_DIR%\settings.json` when that is set (settings docs), else `~/.claude/settings.json`.
Invalid JSON stops the installer with nothing changed. Before every write (install and uninstall)
a copy is saved next to the file (`settings.json.agent-office-3d-<date>.bak`); writes are atomic.
`data/install.json` remembers the first backup and a hash of what was written. Uninstall: if the
file is still exactly what the installer wrote, the pre-install copy comes back byte for byte (or
the file is deleted when the installer created it); otherwise only our handlers are removed, so
changes made since (e.g. through `/config`) survive. Refines PLAN's "uninstall restores the backup".

**D59. The server drops duplicate events.** In this repo both the project hook
(`.claude/settings.json`) and the installed user hook run. The hooks docs say a handler defined in
more than one settings file runs once, but not how handlers are compared, and ours differ in the
path. This could not be checked live in the session, so the server defends itself
(`server/dedupe.js`): a body identical to one fired (`X-Hook-Ts`) within 2 s is dropped (arrival
time when there is no fire time). Real repeats are seconds apart and tool events carry unique
`tool_use_id`s. Checked by running the installed hook command twice in parallel with one input:
1 event, 1 duplicate. `/health` reports `duplicates`.

**D60. Start without a window, stop gracefully, shortcuts optional.** `scripts/start.ps1` starts the
server through a hidden `cmd /c` (a console of its own, so closing the terminal that ran the script
does not stop it; output goes to `data/server.log`), waits for `/health`, then opens the page in an
Edge `--app` window (narrow, no tabs; without Edge the default browser). `scripts/stop.ps1` calls the
new `POST /shutdown`, guarded like `/event` (our header, no Origin, Host check), so the XP file is
saved before the exit (killing the process would skip that). Shortcuts (`.lnk`, icon
`scripts/icon.ico` rendered from the favicon): desktop = start and open; Startup folder = start with
`-NoBrowser` at log-in. Both are asked for, and the uninstaller removes only shortcuts that point at
this clone's `start.ps1`. Started from a shortcut there is no console, so problems show in a message
box.

**D61. Windows-only for now, documented.** The hook and the installer are PowerShell. A macOS/Linux
hook (sh + curl) could not be tested here, so the README describes what a port needs instead of
shipping untested code (PLAN: "or document Windows-only").

**D62. README screenshots show real work.** They were taken from the user's own running monitor
while stage 6 was being written (a headless Edge tab; `?lang=en&hour=` only changes the language and
the sky of that tab), not from scripted events. Frames whose Hook Flow showed local paths were not
used. States that need events this session did not produce (permission, storm, helpers) are not
pictured rather than staged.

## 2026-10-09 - Stage 6 follow-up (user)

**D63. The Code Smelter becomes the Code Editor (replaces D34's "Kod Ocağı").** The user: the
furnace did not make anyone think of code. The Edit station (same place, same key colour orange,
key `editor`, tr "Kod Editörü") is now a workbench with a monitor showing an editor window that
writes line by line while Edit / Write / NotebookEdit run (bars only, no text: a fake file would be
made-up data), a `</>` sign over it, a `</>` emblem on the bench's front, a keyboard and a rubber
duck (rubber duck debugging). The sign floats where the character's nameplate sits while it types,
so the emblem on the front keeps the symbol in view. The bench is turned 20° towards the desk and the
monitor stands left of the keyboard, so the character (seen half from behind) hides little of it;
only the short visit to the duck puts it in front of the screen.
Flames, sparks and the hammer are gone; code bits (`{ }`, `( )`, `;`) float up instead.

**D64. The character never just stands: events decide where it is, `life.js` how it spends the time
there.** The user: it mostly stood still in the middle of a station. At every spot it now moves
between 1-5 stands (keyboard, holo panels, laptop, a thinking spot; the editor's keyboard, a step
back, the duck; two places at the board and a step back), mostly returning to the main one, with an
animation per stand; it breathes, shifts its weight and fidgets (rarely while working), takes small
steps when it turns on the spot and swings its shoulders when it walks. Real events add reactions: a
new prompt (fists up, a little jump), a failed main-agent call (flinch), a level up (cheer), and it
glances at a busy station it does not walk to (Terminal, orbit sphere, portal, racks). Strolls and
fidgets carry no data and say nothing the HUD does not; the spot, the station lights and the
reactions still come only from events. Reduced motion turns strolls, fidgets and reactions off.

**D65. The reference image is removed from the repo and its history (user, 2026-10-09).** It showed
a personal name and a third-party UI, and its origin was not recorded, so it should not be public.
`docs/DESIGN.md` (section 4) already holds every station and its place, so nothing depends on it.
The history was rewritten and force-pushed once, with the user's explicit request.

**D66. Shortcuts are written with Shell32's link object, and the scripts never pass a folder to
`Start-Process`.** The fresh-clone test (stage 6) installed the project under a folder with Turkish
letters, spaces and brackets (`Kullanıcı Ğüş [x]`). `WScript.Shell` writes a shortcut's paths in the
ANSI code page (1252 on English Windows): it could not save a shortcut into such a desktop folder at
all, and in other folders it stored `Kullanici Güs`, so the shortcut silently ran nothing and
the uninstaller did not recognise it. Shell32's `ShellLinkObject` keeps Unicode but only opens an
existing shortcut, so `shortcut.ps1` first writes an empty one (the 80-byte minimum of the
MS-SHLLINK format) and fills it from there; removal reads it the same way and compares as plain text
(`-like` treats `[x]` as a pattern). `Start-Process` reads its working folder as a wildcard and fails
for `[x]`, so `start.ps1` starts programs through `ProcessStartInfo`, uses `-LiteralPath`, and shows
any unexpected error in a message box when run from a shortcut instead of exiting without a word.
Checked: install, both shortcuts, hook in exec form, uninstall (byte-exact restore) in an ASCII
folder and in the Unicode + brackets folder; shortcuts made by the old version are still removed.


**D67. The scene draws only as many frames as its motion needs (stage 7, 2026-10-09).** The user
found the 3D view heavy on the CPU; it sits next to the editor all day and is never focused, so
`document.hidden` rarely helps. Measured with a harness (scratch server + headless Edge + DevTools
protocol: CPU time per process, rendered frames, draw calls, CPU profile), it drew ~55-60 fps in
every state and used ~0.7 cores in standby, ~1.6 while working (renderer + GPU process). Changes:
- *Pacing* (`paceOf` / `frameGap` in director.js): 60 fps only while something travels across the
  screen (a walk to another station, a level-up burst, a shooting star); 30 fps during a session
  (typing, spinning stations, strolls, clouds, falls and the storm's rain look the same); 15 fps in
  standby and once a finished turn had no event for a minute. A live event draws the next frame at
  once. New setting `maxFps` (60 / 30, panel "3D graphics", URL `?fps=`) lowers every pace.
- *Shader churn*: three.js draws a transparent `DoubleSide` material twice (back, then front faces)
  and re-evaluates its program both times, every frame (~24 `getProgram` calls per frame, the largest
  item in the profile). All such parts are flat sheets without depth writes, so realm.js sets
  `forceSinglePass` on them: same picture, ~12 fewer draws and no per-frame program checks.
- *Static parts* (`freeze()` in kit.js): the world (platforms, rocks, pipes, cables) and the decor
  merge opaque meshes that share a material (-11 draw calls) and compute their matrices once. Pixel
  diff against the old version: only the animated parts differ.
- *DOM*: the label layer no longer reads the middle area's rectangle every frame (a forced layout);
  it is measured on resize. The status dot's breathing halo is still now: an endless CSS animation
  makes the browser compose the whole window at the screen's refresh rate for as long as the agent
  works, whatever the scene's frame rate (~15 % of the working-state CPU).
Result (same machine, i7-11800H + Intel UHD, 600x1000, default settings, % of one core, renderer +
GPU process): standby 69 -> 24, idle after a turn 78 -> 48, idle after a quiet minute 78 -> 37,
busy session (a tool call every 1.5 s, many walks) 158 -> 117. Not done: merging station meshes
(their parts move and light up one by one), lower calm rates (strolls and rain look choppy at 15).

**D68. The scene tells at a glance whether the agent needs the user: a window frame, a bubble
over the character, a header chip (stage 8, user request, 2026-10-09).** The user leaves the room
after a prompt, with the monitor on a tablet used as a wireless second screen, and wants to see from
afar: working, asking something, or done and waiting. A first version had a big status band with a
36-44 px word under the header; the user found the text too big and asked for the character to show
it instead, but liked the green frame. Now:
- *Window frame* (5 px, inset, setting `statusFrame`, default on): green = done or ready (the
  user's turn), yellow = needs the user now (with the yellow vignette's blink), red = error, none
  while working. Seen from the corner of the eye.
- *Bubble* on the nameplate's top right: `?` a question or a plan to approve, `!` a permission
  (both yellow and hopping every 1.1 s), `✓` done / ready (green), `✕` error (red), none while
  working. The hop is moved on rendered 3D frames, not by a CSS animation (D67); done and error
  stay still, since they can last for hours and a moving bubble is repainted every frame (~6 % CPU).
- *Header chip* and tab title: the glance word and since when ("Done · 4m 05s", "≥" when the
  server joined in the middle of it); the nameplate says "Done, your turn".
- *What counts as waiting*: PermissionRequest, or a running AskUserQuestion / ExitPlanMode of the
  main agent (hooks docs: both "require user interaction" and run until the user answers, so
  PreToolUse starts the wait and PostToolUse / PostToolUseFailure ends it). No new hook event:
  installed users do not run the installer again. Only the first question's short header leaves
  the server. A question asked in plain text ends with Stop, so it shows as Done (the user's turn).
The server tracks `waitFor` and `statusSince` / `statusExact`; `glanceOf()` in narrate.js maps the
focus session to kind, word, caption and bubble mark.

**D69. Plan limits (5-hour / weekly usage) are not shown (checked 2026-10-09).** The user asked
whether the monitor could track them. The only official source is the status line's JSON
(`rate_limits.five_hour` / `seven_day`: `used_percentage`, `resets_at`; claude.ai Pro/Max only,
after the first response). Hooks carry no usage numbers (only StopFailure `rate_limit` when a limit
is hit, already shown as the storm). A probe `statusLine` in `.claude/settings.local.json` never ran
in the VS Code extension over several turns, so the data does not reach the extension the user
works in; the extension shows usage only in its `/usage` dialog. Reading the account's usage from
Anthropic's servers with the stored login would be an unofficial call with the user's credentials
and is ruled out (privacy, no outside calls). Possible later: forward `rate_limits` from a status
line for users of the terminal CLI.
