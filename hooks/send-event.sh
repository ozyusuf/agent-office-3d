#!/bin/sh
# agent-office-3d hook for Linux and macOS: forwards one Claude Code hook event to the local server.
#
# The POSIX twin of send-event.ps1, with the same contract (docs/DECISIONS.md D1-D5, D70):
#   - never writes to stdout (stdout of some hooks is shown to Claude),
#   - exits 0 quietly and quickly when the server is not running or curl is missing,
#   - never parses or changes the event (the server does that).
# Needs only sh and curl. Keep this file ASCII-only.

# The moment Claude Code fired this hook, in Unix milliseconds. The server uses it to restore event
# order, because async hook processes finish in random order. GNU date knows %N; BSD date (macOS)
# prints it literally, so fall back to whole seconds there.
hook_ts=$(date +%s%3N 2>/dev/null)
case $hook_ts in
  *[!0-9]* | '') hook_ts="$(date +%s)000" ;;
esac

command -v curl >/dev/null 2>&1 || exit 0

# Port: env AGENT_OFFICE_PORT, else "port" in config.json, else 7847 (same order as the server).
port=7847
if [ -n "$AGENT_OFFICE_PORT" ]; then
  port=$AGENT_OFFICE_PORT
else
  config="$(dirname "$0")/../config.json"
  if [ -f "$config" ]; then
    found=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9][0-9][0-9][0-9]*\).*/\1/p' "$config" 2>/dev/null | head -n 1)
    [ -n "$found" ] && port=$found
  fi
fi
case $port in
  *[!0-9]* | '') exit 0 ;;
esac

# curl reads the hook JSON from stdin as raw bytes and sends it unchanged. It sends no Origin header,
# which the server requires for /event (D6). A refused localhost connection fails at once on Linux and
# macOS; the short timeouts only guard against a server that hangs.
curl --silent --output /dev/null --max-time 2 --connect-timeout 0.3 \
  -X POST "http://127.0.0.1:$port/event" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'X-Agent-Office: 1' \
  -H "X-Hook-Ts: $hook_ts" \
  --data-binary @- >/dev/null 2>&1

exit 0
