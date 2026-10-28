#!/bin/sh
# Stops a running agent-office-3d server. Linux and macOS; the twin of stop.ps1.
# POST /shutdown with our header and no Origin, the same guard as /event (D6).
# Keep this file ASCII-only.
set -u
. "$(dirname -- "$0")/common.sh"

if ! agent_office_running; then
  say "agent-office-3d is not running on port $PORT."
  exit 0
fi
curl --silent --output /dev/null --max-time 2 -X POST -H 'X-Agent-Office: 1' "$URL/shutdown"
tries=0
while agent_office_running; do
  tries=$((tries + 1))
  if [ "$tries" -gt 25 ]; then
    fail "The server on port $PORT did not stop."
    exit 1
  fi
  sleep 0.2
done
say 'agent-office-3d stopped.'
exit 0
