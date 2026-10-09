# Design

This file is the source of truth for the look (D49) and for which stations exist and where they
stand (section 4). The original reference image is no longer in the repo (D65).

## 1. Mood and principles
A small workshop floating above a sea of clouds, seen from above like a model: matte dark metal
platforms on flat-shaded rock islands, warm practical lights (a desk lamp, slit lights under the
rims), a chibi hacker in the middle. The sky keeps the viewer's local time (D54): dawn glow, a bright
day, a warm sunset, moon, stars and fireflies at night. Three rules:
1. **Light is information (D50).** At rest the realm is calm and dim: station neon sits below the
   bloom threshold and platform rims are thin accent lines. A station lights up in its colour only
   while it works, so where the light is tells what is going on. Ambient loops (dust, falls, fire)
   keep moving quietly; the falls' brightness and speed follow the real event rate.
2. **One voice of colour.** Ink, warm "bone" text and one accent (the setting, cyan by default).
   Every other colour is a signal: ember = edit, accent = read, green = search, yellow = shell and
   permission, blue = web, magenta = helpers / arcade, red = errors.
3. **An instrument, not a costume (D51).** The HUD is precise and quiet: no glass boxes, glowing
   borders or angled plates; hairlines, tracked small caps, tabular numbers. The scene runs
   full-bleed; two edge scrims keep the text legible.

## 2. Palette
Measured from the reference with a pixel histogram (right half). "Measured" values come straight
from the image; "derived" ones are not in the image and were chosen to fit. Define all as CSS
custom properties in `web/theme.css` and mirror them as numbers in the 3D code (`web/palette.js`).

| Token | Hex | Source | Use |
|---|---|---|---|
| `--bg-void` | `#040414` | measured (darkest) | page background, fog far colour |
| `--bg-deep` | `#040c1c` | measured (most common dark) | scene clear colour |
| `--bg-navy` | `#081828` | measured | lit metal in shadow, gradient top |
| `--surface` | `#0e213b` | measured (title banner fill) | HUD panel fill (with alpha) |
| `--surface-violet` | `#1b1b37` | measured | secondary panel fill, platform tops |
| `--metal` | `#3c3c3c` | measured (pipes/platform grey) | metal albedo |
| `--neon-cyan` | `#33b7de` | measured peak | primary neon, borders, data, waterfalls |
| `--neon-cyan-soft` | `#4fc3e4` | measured mean | text glow, bar fill highlight |
| `--neon-blue` | `#2c78b9` | measured | holo screens, orbit sphere body |
| `--neon-purple` | `#724bb6` | measured | secondary rings, session bar |
| `--neon-magenta` | `#e350a4` | measured | portal ring, XP bar, accents |
| `--fire-orange` | `#f1ad56` | measured (flame highlights) | Code Editor lamps and `</>` sign, Edit skill |
| `--fire-deep` | `#e0662a` | derived | flame base / embers |
| `--warn-yellow` | `#f4c752` | measured | permission waiting, blink |
| `--ok-green` | `#56d999` | measured (small status lights) | connected icon, rack LEDs |
| `--alert-red` | `#ff3b5c` | derived (reference has no red state) | StopFailure / limit alert |
| `--text` | `#e6f6ff` | derived | primary HUD text |
| `--text-dim` | `#8aa4c0` | derived | secondary text, timestamps |

HUD tokens added in the redesign (derived, `theme.css`): `--ink #060910` (scrims, panel fill),
`--text #ece8df` (warm bone), `--text-soft #b8bcc6`, `--text-dim #858d9c`, `--text-faint #4f5767`,
`--hair` (bone at 13 %, hairlines), `--accent` = `--neon-cyan`, `--lamp #ffc48a` (desk lamp), and
`--skill-*` station colours (read = accent soft, search = green, edit = fire orange, shell = yellow,
web = `#6aa8ff`, permission = yellow, helper = magenta).

Accent colour (setting `accentColor`, D47) replaces `--neon-cyan`; `--neon-cyan-soft` becomes the
accent with 15 % white. In 3D every material built in the base cyan follows it.

Typography: system fonts only (nothing downloaded). `Bahnschrift` (a DIN face shipped with Windows,
has the Turkish glyphs) for everything in the HUD, labels in tracked uppercase (0.12-0.16 em),
numbers tabular; `Cascadia Mono` / `Consolas` for the log. Fallbacks: DIN Alternate, Segoe UI,
system-ui; ui-monospace.

## 3. Screen layout (HTML/CSS overlay on top of the full-bleed 3D canvas)
Target window: narrow portrait, about half a 1920x1080 screen (e.g. 600-960 px wide, 1000+ tall).
Must also work down to 420 px wide. Nothing scrolls; the log scrolls inside itself.

```
+--------------------------------------------------+
| ⬡ AGENT-OFFICE-3D       ● WORKING · 12 TOOLS • ⚙ |  header (wordmark | state, connection, gear)
|   demo-project                                   |
| ------------------------------------------------ |  hairline
| CONTEXT   34/150 | EFFORT     high | TIME    42m  |  instruments
| ▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯ | ▮▮▮▯▯           | ━━━━━●─────  |
|                                                  |
|          ■ VISION & TASK BOARD                   |  callout labels with leader lines
|               |                                  |
|   (LV 3) Claude · Editing (auth.js)              |  nameplate over the character
|            (3D scene, isometric)                 |
|                                                  |
| HOOK FLOW ---------------------------------------|
| 09:35 | auth.js analysed...                      |  log, newest at the bottom
| ------------------------------------------------ |  skill rail (the line lights above the active one)
| ▫ READ  ⌕ GREP  ♨ EDIT  >_ BASH  ◎ WEB  ◌ PERMISSION |
+--------------------------------------------------+
```

- **Scrims**: an ink gradient at the top (~170 px) and the bottom (~270 px) behind the HUD text;
  the scene fades into them. No other backgrounds behind the HUD.
- **Header** (top row): left a small isometric cube mark in the accent, the realm title (tracked
  uppercase, 14 px bold) and under it the subtitle (dim). Default title "agent-office-3d" (same in every
  language, uppercased as English); subtitle defaults to the current project folder name (from the
  event `cwd`), hidden until one is known or when it equals the title. Both overridable in settings
  (`realmTitle`, `realmSubtitle`); a custom title is uppercased in the page language (tr: i -> İ).
  Right: the session state as text with a dot (working = accent dot with a slow breathing halo,
  idle dim, waiting yellow blinking, error red, ended / none faint) and "· N tools" (finished tool
  calls of the session; hidden under 480 px), the connection dot (green, yellow connecting, red
  blinking when dropped), the gear (opens the settings panel).
- **Instruments** (under a hairline): three cells side by side, split by hairlines. Each = small caps
  label, value on the right, meter below. Before the first event only "waiting for events".
  1. Context - the real tokens in the main agent's context, read from the end of the session
     transcript (D55), e.g. "573k / 1M"; the window is the setting `contextWindow` (auto = 200k, or
     1M once more is in use). 30 cells, accent. Until the transcript can be read: main-agent tool
     calls since the last compaction / `contextBarMax` ("≥" when the server joined mid-session).
  2. Effort - `effort.level` from the latest event: low 1/5 ... max 5/5; 5 cells (bone); "–" if no
     event carried it yet.
  3. Session time - since SessionStart (or first event seen, "≥"); a 2 px line with a bright head,
     full at `sessionBarMinutes` (default 120).
- **Nameplate** (follows the character's head, hidden while there is no character): dark capsule; a round level badge whose ring is the
  XP progress to the next level (accent), "Name · activity (file)" and "xp / needed XP" under it. The
  activity value is accent, yellow while waiting for permission, red on error.
- **Station callouts** (`web/labels.js`, D52): small uppercase labels on a dark chip, 16 px above the
  station, joined to it by a hairline leader with a dot. Idle: dim text and a grey square. Active:
  bright text, the square and the leader in the station's colour. Always shown: Code Editor,
  Vision & Task Board, Terminal; only while active: Orbit Sphere, Server Racks, Portal Ring, Arcade;
  never: desk (the nameplate is there) and data falls (`web/stations.js`). Labels shrink with the
  scene (down to 70 %), step aside the shortest way when they overlap (nameplate first, then active
  stations) and stay inside the free middle area; the leader follows. Without WebGL: fixed slots.
- **Hook Flow log** (bottom): small caps heading with a hairline; monospace lines `HH:MM ▍ text`,
  newest at the bottom (few lines sit at the bottom too), older lines fade out at the top; 6 lines
  (4 in windows under 820 px tall); keep last 200. Values are brighter than the sentence; the
  marker bar has the colour of what happened (tool lines: their station's colour; prompt accent,
  session violet, permission yellow, failures red, helpers magenta, compaction orange). PostToolUse
  adds no line. "↳" marks calls inside a subagent; with 2+ sessions every line gets a 4-character
  session tag.
- **Skill rail** (very bottom, under a hairline): Read, Grep, Edit, Bash, Web, Permission as line
  icons + small caps names. Idle = faint. Active = bright, icon in its colour, and the rail segment
  above it lights up in that colour. Permission waiting = yellow, blinking (~1 Hz). Turkish labels:
  Oku, Ara, Düzenle, Komut, Web, İzin ("İzin Bekliyor" while waiting).
- **Settings panel** (gear, `web/settings.js`, D46-D48): an ink panel with a hairline border under
  the gear; groups: names (agent name, title, subtitle, language), accent colour (6 presets + any
  colour), sky (clock / dawn / day / dusk / night), 3D graphics (bloom, pixel ratio, measured fps),
  bars (context window auto / 200k / 1M, time bar scale).
- **Level up** (D56): when the XP crosses a level, a centred banner "Level up · LV n" (gold small caps
  over a big bone number, thin gold lines growing out to the sides) shows for ~3.4 s, the level badge
  pulses gold and the scene throws sparks (see section 5). Every
  change shows at once, is saved to config.json and applies in every open tab. Scrolls inside when
  the window is short.
- **i18n**: one file `web/i18n.js` with `tr` and `en`; default from settings. Station names:

| Key | en | tr |
|---|---|---|
| desk | Command Desk | Komuta Masası |
| editor | Code Editor | Kod Editörü |
| board | Vision & Task Board | Görüş ve Görev Panosu |
| centrifuge | Terminal | Terminal |
| orbit | Orbit Sphere | Yörünge Küresi |
| racks | Server Racks | Sunucu Kabinleri |
| falls | Data Falls | Veri Şelaleleri |
| portal | Portal Ring | Geçit Halkası |
| arcade | Arcade | Oyun Makinesi |

## 4. 3D scene
Orthographic isometric camera (~35° down, 45° yaw), framed for portrait.
Sky (`sky.js`, `daylight.js`, D54): a gradient plane riding with the camera (top -> horizon glow ->
deep below), a field of ~200 cumulus puffs (one instanced mesh, lit top / shaded base, drifting right)
on two layers below the islands whose far rows melt into the horizon band, stars and the moon or sun
on an arc from left to right, fireflies after dark. Keyframes (local hour): 0 night, 4.5 late night,
6 dawn, 7.5 morning, 12 noon, 16 afternoon, 18 sunset, 19.5 dusk, 21 night. The hemisphere, key and
fill lights, the key light's direction, the exposure, the reflection map and the HUD scrims follow.
Fog only reaches what lies far behind or deep below (pipes sinking into the clouds).
Floating dark metal platforms at slightly different heights on rock islands (upside-down cones of
flat-shaded facets, lighter strata on top, a few accent crystals), joined by pipes; every platform
rim is a thin accent line below the bloom threshold (main 0.8, others 0.55); warm slit lights under
the rims. Lights: hemisphere + sun/moon key, a warm desk lamp (`#ffc48a`) in front of the
character, and one point light per station that pools only while it works (0.45x at rest, up to
1.45x). Bloom: strength 0.75, radius 0.5, threshold 0.85 - only working stations (and the sun) bloom.
Placement as seen in the reference (screen positions inside the realm view):

| Object | Where | Look | Driven by |
|---|---|---|---|
| Command desk + character | centre | round dais with accent rings; ring console open towards the camera (a closed front hid the character), holo keyboard in the opening; character stands inside. Console rests at 0.42, dais rings at 0.3; both light up while the agent types and flash on a prompt | everything |
| Code Editor (D63) | left of centre, slightly lower | workbench turned a little towards the desk: a monitor showing an editor window (title bar, tabs, gutter, minimap; code as coloured bars, no text), a keyboard at the right end, a rubber duck at the left end, a `</>` emblem on the front panel and a `</>` sign floating over the monitor; at rest the sign and lamps are dim orange, the screen at 0.55. While it works the editor writes line by line at a blinking cursor (new lines push the rest down and get an orange change mark), `{ }` `( )` `;` bits float up off the screen and everything orange lights up | Edit, Write, NotebookEdit |
| Vision & Task Board | right/behind character | large curved holo screen (blue, coloured code bars); screen 0.48 at rest, frame and projector beam light up | Read, Grep, Glob, todo/task tools |
| Terminal (key `centrifuge`) | bottom right | 3 nested gimbal rings (orange, accent, yellow) on a base with a yellow rim; nearly dark at rest (0.09), spin up and blaze while a command runs | every Bash, PowerShell call |
| Orbit Sphere | top right | blue glowing planet with 2 tilted rings, on a pipe pedestal | WebSearch, WebFetch |
| Server racks | top left, behind | 3 tall cabinets with LED rows | context fill |
| Data falls | bottom left + right edge | accent texture waterfalls from pipes into basins; speed and brightness (0.3x-1x) follow the event rate | activity rate |
| Portal ring | top centre, floating | big flat magenta + accent ring (plus a small one top left); almost dark (0.08) until a helper runs, flares when one comes or goes | subagents |
| Arcade machine | far left | dark purple cabinet; marquee, edges and screen light up while the agent plays | Stop (idle) |
| Decor | around | potted plants, small canisters, cable bundles | none |

Character: chibi proportions (big head), dark hoodie with cyan trims, headphones, cyan visor
glasses, messy dark hair. Build from primitives first; if it looks poor, propose a CC0 model and ask.

Framing: the main platform takes at most 78 % of the free middle area's width, and the scene from the
big portal down to the lower data-fall basin at most its height (+ a little room under the edge
scrims). Side platforms may run off the window edges, as in the reference.

Resting and working levels (`lamp()` / `brighten()` in kit.js): a station's neon sits at about 0.1-0.4
of its full intensity at rest and goes to ~1.1x while it works. After a finished turn the whole scene
is 16 % darker (the arcade stands out); standby and StopFailure dim it further (see section 5).

Performance: `renderer.setPixelRatio(Math.min(devicePixelRatio, cap))` (default cap 1.5), stop the
loop on `document.hidden`, bloom toggle (UnrealBloomPass, half-res), shared materials, instanced
LEDs/particles, no shadows, frames closer than 1000/75 ms are skipped (60 Hz draws every frame,
120/144 Hz draw 60/72). MSAA on the bloom target only below pixel ratio 1.5. Target 60 fps on
integrated GPUs with the default settings (measured on Intel UHD, see PROGRESS session 3).
Settings: `bloom`, `pixelRatioCap` in config.json, changed from the settings panel (URL `?bloom` / `?pr`
override them for one tab).

Decoration vs data: the board's and the editor's "code" is coloured bars only (no characters or
numbers; the `</>` sign and the floating `{ }` `( )` `;` bits are symbols, not text); the only
real values in the 3D scene are the board's ticker (file name, search pattern, task chips), the
lit rack LEDs (context fill) and the helper bots (one per running subagent). Ambient loops keep
running at a low idle level; events speed them up. The sky, clouds and fireflies follow only the
clock (or the `sky` setting) and stand for no session data. What the character does while it stays
at a spot (strolling between stands, fidgets) is decoration too (D64); where it is is not.

Stage 4 wiring (`web/scene/`): `director.js` turns the server snapshot (+ live events) into goals,
`realm.js` eases a shared `drive` object towards them every frame (stations rise in ~0.2 s, settle
back in ~1 s), stations / character / bots read `drive`. The character walks a fixed network
(`walk.js`): a ring around the dais (r 2.15, never behind the console) plus one leg per spot:
desk (inside the console), editor (in front of the bench's right end), board (in front of its right
half), arcade (over the step on the west platform). Walks take ~1.2 s (3.2-7.5 units/s). It only
follows the main agent's calls; it stays at a work station 2.5 s after the call ends (no running back
and forth between calls), and every PreToolUse lights its station for at least 0.7 s, so 50 ms calls
are still seen. Poses: stand, type, code, present (points at the board), wave, play, slump.

Character life (D64, `life.js`, decoration only): the spot always follows the events; while the
character stays there it moves between the spot's stands every 2-7 s at a stroll (1.5 units/s,
`walk.js`): desk = holo keyboard (type), the two holo panels (swipe), the laptop (type), a free spot
(hand at the chin, thinking); editor = keyboard (types, eyes on the monitor), a step back to the
right (hands on hips, studying the screen without hiding it), the rubber duck (explains with both
hands); board = two places in front of it (presents) and a step back (studies it). It mostly
returns to the main stand, where the work is.
Standing still it breathes, shifts its weight and fidgets now and then (looks round, stretches, nods
to the music with a hand on the headphones, a little hop; rarely while working; cheers or leans back
at the arcade). Turning on the spot takes small steps; walks swing the shoulders against the hips
and run when long. It glances at a busy station it does not walk to (Terminal while a command runs,
the orbit sphere for the web, the portal while helpers are out or one comes / goes, the racks while
compacting). Waving, slumping and playing stay put. Reduced motion: no strolling, fidgets or
reactions (it still goes where the work is).

## 5. Event -> reaction
Every reaction is caused by a real event. "Pair" = matched by `tool_use_id`.

| Event | Condition | 3D | HUD |
|---|---|---|---|
| SessionStart | any `source` | scene powers up from standby (dim), character appears at the desk in a light column, dais flashes | session timer starts; state working/idle; log "Session started (source)" |
| UserPromptSubmit | - | dais flashes; character raises its fists with a little jump, goes to the desk and types; clears waiting/error states | log "New request"; state working. Prompt text is NOT shown in the HUD (debug view only) |
| PreToolUse | Read | character walks to the Board and points at it; board brightens; file name runs along a ticker strip at the board's bottom | Read lights up on the skill rail; label "Reading (file)" |
| PreToolUse | Grep, Glob | same, the ticker shows the pattern (magnifier icon) | Grep lights up on the skill rail; label "Searching (pattern)" |
| PreToolUse | Edit, Write, NotebookEdit | character walks to the Code Editor and types (now and then studies the screen or talks to the duck); the editor writes line by line, code bits float up, sign, emblem and lamps glow | Edit lights up on the skill rail; label "Editing (file)" |
| PreToolUse | Bash, PowerShell | character types at the desk; Terminal rings spin up and brighten | Bash lights up on the skill rail; label "Running command" |
| PreToolUse | WebSearch, WebFetch | character types at the desk; Orbit Sphere spins faster, rings brighten | Web lights up on the skill rail; label "Searching the web (host)" |
| PreToolUse | TodoWrite, Task* tools | character to the Board; TodoWrite: ticker shows one chip per task (done green, in progress yellow, open outline; counts only) | label "Planning tasks" |
| PreToolUse | anything else (MCP, Skill, ...) | character types at the desk; desk holograms pulse | log only |
| PostToolUse | pair | station eases back to idle (~1 s); character stays 2.5 s, then returns to the desk | context +1, total +1 (XP); skill dims |
| PostToolUseFailure | pair (fires instead of PostToolUse when a tool errors or is interrupted) | station sputters: drops dark at once, red flicker (~1 s); a main-agent failure makes the character flinch (shoulders up, a shake of the head) | context +1, total +1 (the call still used context); skill dims; log "Tool failed: error" or "Interrupted" |
| PermissionRequest | - | desk light turns yellow; character turns to the camera and waves (at its station) | yellow vignette blinks over the scene; Permission blinks yellow; state waiting; log "Permission needed: Tool (target)". Cleared by pair PostToolUse, next PreToolUse, UserPromptSubmit or Stop |
| SubagentStart | per `agent_id` | helper bot rises out of the big portal (portal flares), hovers over the station of its current call, circles the portal while thinking | log "Helper launched (agent_type)"; Portal Ring label while helpers run |
| SubagentStop | same `agent_id` | helper flies back over the portal and sinks into it; its unfinished calls end | log "Helper returned" |
| PreCompact | `trigger` | rack strips flash, LEDs drain top to bottom (1.5 s) | log "Compacting context (auto/manual)" |
| PostCompact | - | racks stay empty | context bar -> 0 |
| Stop | - | character walks to the arcade and plays; arcade screen lights up; the scene lowers its lights a little; a shooting star crosses the sky if the stars are out | state idle; log "Turn finished" |
| (derived) | XP crosses a level | gold sparks burst out of the character, a gold ring runs over the dais, the character cheers | "Level up · LV n" banner, badge pulses |
| (derived) | transcript usage (main thread) | rack LEDs lit = tokens / window x 144 | context meter in tokens |
| StopFailure | `error` (e.g. rate_limit) | lights go down, red alert pulse on every platform rim; a storm over the realm: darker clouds and sky, rain, soft lightning now and then; character slumps at the desk | red vignette; state error (red); label shows error type; cleared by next UserPromptSubmit/SessionStart |
| SessionEnd | `reason` | scene dims to standby, character fades out in a light column | timer stops; state ended; log "Session ended (reason)" |
| (derived) | events in the last 60 s (all sessions) | data falls: 0.3x when idle up to ~3.8x at 40+ events per minute | - |
| (derived) | tool uses since compaction (fallback, no transcript yet) | rack LEDs lit = count / `contextBarMax` (bottom row first, all 144 at the max) | context bar |

Safety nets against stuck states (server): a main-agent PreToolUse or Stop/StopFailure ends a
compaction that never got PostCompact; SubagentStop ends that helper's unfinished calls. A permission
denied in the dialog fires no hook (hooks docs), so "waiting" stays until the next event that clears it.

Level: XP = total finished tool calls (PostToolUse + PostToolUseFailure), stored on disk by the server.
`level = floor(sqrt(xp / 5)) + 1`; progress = `(xp - 5(L-1)^2) / (5L^2 - 5(L-1)^2)`.

Multiple sessions: the "focus" session is the one with the most recent event; other sessions still
appear in the log with a short session tag.
