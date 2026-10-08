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
