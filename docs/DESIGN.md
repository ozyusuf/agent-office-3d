# Design

Target image: `docs/design/reference.png` (the right half, x >= 516 px, is the realm screen; the left
half only shows VS Code next to it). This file describes the design well enough to build it without
opening the image.

## 1. Mood
Night-time cyber RPG workshop floating in a void. Isometric view of dark metal platforms on pipes,
lit by neon edge strips. Mostly very dark navy/indigo; colour comes only from light sources:
cyan (dominant), magenta and purple accents, orange fire, yellow for warnings. Soft bloom on every
emissive edge. Small chibi hacker character in the middle. HUD panels are dark glass with thin
glowing cyan borders.

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
| `--fire-orange` | `#f1ad56` | measured (flame highlights) | furnace glow, Edit skill |
| `--fire-deep` | `#e0662a` | derived | flame base / embers |
| `--warn-yellow` | `#f4c752` | measured | permission waiting, blink |
| `--ok-green` | `#56d999` | measured (small status lights) | connected icon, rack LEDs |
| `--alert-red` | `#ff3b5c` | derived (reference has no red state) | StopFailure / limit alert |
| `--text` | `#e6f6ff` | derived | primary HUD text |
| `--text-dim` | `#8aa4c0` | derived | secondary text, timestamps |

HUD glass: fill `rgba(14, 33, 59, 0.72)` (`--surface` at 72 %), border 1 px `--neon-cyan` at ~60 %,
outer glow `0 0 12px` cyan at ~35 %, radius 4-6 px. Accent colour (stage 5) replaces `--neon-cyan`.

Typography: techy sans for titles/labels (must include Turkish glyphs İ Ş Ğ Ç Ö Ü ı), monospace for
the log. Candidates (OFL, self-hosted, ask before downloading): Exo 2 or Rajdhani + JetBrains Mono.
Fallback stack: `Bahnschrift, "Segoe UI", sans-serif` and `Consolas, monospace`.

## 3. Screen layout (HTML/CSS overlay on top of the full-bleed 3D canvas)
Target window: narrow portrait, about half a 1920x1080 screen (e.g. 600-960 px wide, 1000+ tall).
Must also work down to 420 px wide. Nothing scrolls; the log scrolls inside itself.

```
+--------------------------------------------------+
| [stats panel]   ╔═ REALM TITLE ═╗   (o)(o)(⚙)    |  top row
|  ctx  ▓▓▓░░     ╚══ subtitle ═══╝                |
|  eff  ▓▓░░░                                      |
|  time ▓░░░░                                      |
|                                                  |
|            (3D scene, isometric)                 |
|      [Station label]          [Station label]    |
|               (24) Name · Editing (auth.js)      |  character label
|                    ▓▓▓▓▓▓░░░░                    |
|                                                  |
|               ┌──── Hook Flow ────┐              |
| [06:35] auth.js analysed...                      |  log panel
| [06:35] ...                                      |
| ● Read  ● Grep  🔥 Edit  ⚡ Bash  🌐 Web  🔔 Perm |  skill bar
+--------------------------------------------------+
```

- **Title banner** (top centre): angled-corner frame, cyan border with magenta corner accents.
  Line 1 = realm title (uppercase, letter-spaced, white with cyan glow). Line 2 = subtitle (small,
  cyan, letter-spaced). Default title is translated ("Cyber-Realm" / "Siber Diyar"); subtitle defaults
  to the current project folder name (from the event `cwd`) and is hidden until one is known. Both
  overridable in settings (`realmTitle`, `realmSubtitle`). Uppercase follows `<html lang>` (tr: i -> İ). Below ~560 px width the banner takes its
  own row and the stats panel + icons sit under it.
- **Stats panel** (top left, small glass panel): a status line (coloured dot + session state), a
  header "Session" with the session's finished tool count, then three meters. Each meter = label and
  real value on one line, thin bar below (the column is only ~175 px wide at 600 px):
  1. Context fill - main-agent tool uses since the last compaction (count / `contextBarMax`, default
     150; subagent calls do not count). "≥" when the server joined mid-session. Cyan -> green.
  2. Effort - `effort.level` from the latest event: low 1/5, medium 2/5, high 3/5, xhigh 4/5, max 5/5;
     "–" if no event carried it yet. Magenta.
  3. Session time - since SessionStart (or first event seen, shown with "≥"); bar fills over
     `sessionBarMinutes` (default 120). Purple.
  Before the first event the panel shows only "waiting for events" (no bars).
- **Status icons** (top right, row of small round glass buttons): connection (green connected /
  red dropped), session state (cyan working, grey idle, yellow waiting permission, red error,
  dim ended), settings (gear). Stage 2: the gear opens a small menu (language TR/EN for this tab,
  link to the debug view); stage 5 replaces it with the full panel.
- **Character label** (screen-projected above the character's head): round level badge
  ("Lvl" + number), text "Name · activity (file)", e.g. "Şimşek · Editing (auth.js)", and a thin
  XP bar (magenta -> pink) showing progress to the next level, with "xp / needed XP" under it.
  The orange ring around the badge is decoration. The activity value is cyan, yellow while waiting
  for permission, red on error.
- **Station labels**: small glass pills with thin cyan border floating above each station
  (screen-projected each frame). Active station's label brightens. Stage 2 shows only Code Smelter,
  Vision & Task Board and Test Centrifuge at fixed slots (`web/stations.js`).
- **Hook flow log** (bottom): glass panel with a centred tab title "Hook Flow" on its top edge.
  Monospace lines `[HH:MM] <readable text>`; newest at the bottom; auto-scroll; ~5 visible lines;
  keep last 200. Lines are human sentences from i18n, e.g. "auth.js okunuyor...": values white,
  the sentence tinted by event type. PostToolUse adds no line. "↳" marks calls inside a subagent;
  with 2+ sessions in the log every line gets a 4-character session tag.
- **Skill bar** (very bottom, full width, dark strip): Read, Grep, Edit, Bash, Web, Permission.
  Each = icon/dot + label. Idle = dim. Active = glows in its colour and shows "(active)".
  Permission waiting = yellow blink (~1 Hz). Colours: Read purple-blue dot, Grep green dot (as in
  the reference), Edit fire-orange flame, Bash yellow bolt, Web blue globe, Permission yellow bell.
  Turkish labels: Oku, Ara, Düzenle, Komut, Web, İzin ("İzin Bekliyor" while waiting).
- **i18n**: one file `web/i18n.js` with `tr` and `en`; default from settings. Station names:

| Key | en | tr |
|---|---|---|
| desk | Command Desk | Komuta Masası |
| smelter | Code Smelter | Kod Ergitme |
| board | Vision & Task Board | Görüş ve Görev Panosu |
| centrifuge | Test Centrifuge | Test Sınama |
| orbit | Orbit Sphere | Yörünge Küresi |
| racks | Server Racks | Sunucu Kabinleri |
| falls | Data Falls | Veri Şelaleleri |
| portal | Portal Ring | Geçit Halkası |
| arcade | Arcade | Oyun Makinesi |

## 4. 3D scene (stage 3)
Orthographic isometric camera (~35° down, 45° yaw), framed for portrait. Fog towards `--bg-void`.
Floating dark metal platforms (`--metal` / `--surface-violet`, low roughness) at slightly different
heights, joined by pipes; neon edge strips on platform rims (cyan, some magenta/purple).
Placement as seen in the reference (screen positions inside the realm view):

| Object | Where | Look | Driven by |
|---|---|---|---|
| Command desk + character | centre | round desk, glowing cyan rim, holo keyboard; character sits/stands at it | everything |
| Code Smelter | left of centre, slightly lower | boxy furnace, orange fire core, sparks | Edit, Write, NotebookEdit |
| Vision & Task Board | right/behind character | large curved holo screen (blue, cyan code lines) | Read, Grep, Glob, todo/task tools |
| Test Centrifuge | bottom right | 3 nested gimbal rings (magenta, cyan, yellow) on a base | Bash, PowerShell |
| Orbit Sphere | top right | blue glowing planet with 2 tilted rings, on a pipe pedestal | WebSearch, WebFetch |
| Server racks | top left, behind | 3 tall cabinets with LED rows | context fill |
| Data falls | bottom left + right edge | cyan particle/texture waterfalls from pipes into basins | activity rate |
| Portal ring | top centre, floating | big flat magenta+cyan neon ring (plus a small one top left) | subagents |
| Arcade machine | far left | pink/purple arcade cabinet with glowing screen | Stop (idle) |
| Decor | around | potted plants, small canisters, cable bundles | none |

Character: chibi proportions (big head), dark hoodie with cyan trims, headphones, cyan visor
glasses, messy dark hair. Build from primitives first; if it looks poor, propose a CC0 model and ask.

Performance: `renderer.setPixelRatio(Math.min(devicePixelRatio, cap))` (default cap 1.5), stop the
loop on `document.hidden`, bloom toggle (UnrealBloomPass, half-res), shared materials, instanced
LEDs/particles, no shadows by default, target 60 fps on integrated GPUs with bloom off.

## 5. Event -> reaction
Every reaction is caused by a real event. "Pair" = matched by `tool_use_id`.

| Event | Condition | 3D | HUD |
|---|---|---|---|
| SessionStart | any `source` | scene powers up, character appears at desk | session timer starts; state working/idle; log "Session started (source)" |
| UserPromptSubmit | - | character faces desk, types; clears waiting/error states | log "New request"; state working. Prompt text is NOT shown in the HUD (debug view only) |
| PreToolUse | Read | character to Board; file name scrolls on screen | Read glows; label "Reading (file)" |
| PreToolUse | Grep, Glob | character to Board; pattern scrolls | Grep glows; label "Searching (pattern)" |
| PreToolUse | Edit, Write, NotebookEdit | character to Smelter; flame grows | Edit glows; label "Editing (file)" |
| PreToolUse | Bash, PowerShell | Centrifuge rings speed up | Bash glows; label "Running command" |
| PreToolUse | WebSearch, WebFetch | Orbit Sphere spins faster, rings brighten | Web glows; label "Searching the web (host)" |
| PreToolUse | TodoWrite, Task* tools | Board shows task count | label "Planning tasks" |
| PreToolUse | anything else (MCP, Skill, ...) | desk hologram pulses | log only |
| PostToolUse | pair | station eases back to idle (~1 s) | context +1, total +1 (XP); skill dims |
| PostToolUseFailure | pair (fires instead of PostToolUse when a tool errors or is interrupted) | station sputters: short red flicker, then idle | context +1, total +1 (the call still used context); skill dims; log "Tool failed: error" or "Interrupted" |
| PermissionRequest | - | scene tints yellow, character waves at camera | Permission blinks yellow; state waiting; log "Permission needed: Tool (target)". Cleared by pair PostToolUse, next PreToolUse, UserPromptSubmit or Stop |
| SubagentStart | per `agent_id` | small helper bot rises out of the portal and hovers near the work | log "Helper launched (agent_type)"; helper count |
| SubagentStop | same `agent_id` | helper flies back into the portal and fades | log "Helper returned" |
| PreCompact | `trigger` | racks flash, LEDs drain top to bottom | log "Compacting context (auto/manual)" |
| PostCompact | - | racks empty | context bar -> 0 |
| Stop | - | character walks to the arcade and plays; falls slow down | state idle; log "Turn finished" |
| StopFailure | `error` (e.g. rate_limit) | lights go out, red alert pulse on rims | state error (red); label shows error type; cleared by next UserPromptSubmit/SessionStart |
| SessionEnd | `reason` | scene powers down, character fades | timer stops; state ended; log "Session ended (reason)" |
| (derived) | events in the last 60 s | data falls speed scales with rate; slow when idle | - |
| (derived) | tool uses since compaction | rack LEDs lit = count / `contextBarMax` | context bar |

Level: XP = total finished tool calls (PostToolUse + PostToolUseFailure), stored on disk by the server.
`level = floor(sqrt(xp / 5)) + 1`; progress = `(xp - 5(L-1)^2) / (5L^2 - 5(L-1)^2)`.

Multiple sessions: the "focus" session is the one with the most recent event; other sessions still
appear in the log with a short session tag.
