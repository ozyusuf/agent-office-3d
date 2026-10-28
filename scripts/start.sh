#!/bin/sh
# Starts the agent-office-3d server in the background (if it is not running yet) and opens the
# monitor. Linux and macOS; the twin of start.ps1.
#
#   sh scripts/start.sh               start (if needed) and open the monitor
#   sh scripts/start.sh --no-browser  start only
#
# The server log goes to data/server.log. Keep this file ASCII-only.
set -u
. "$(dirname -- "$0")/common.sh"

open_browser=1
[ "${1:-}" = '--no-browser' ] && open_browser=0

if agent_office_running; then
  say "agent-office-3d is already running at $URL"
else
  if ! command -v node >/dev/null 2>&1; then
    fail 'Node.js was not found. Install Node.js 20 or newer and run this again.'
    exit 1
  fi
  if [ ! -d "$ROOT/node_modules" ]; then
    fail 'Packages are missing. Run install.sh first (or npm install in the project folder).'
    exit 1
  fi
  data="${AGENT_OFFICE_DATA:-$ROOT/data}"
  case $data in /*) ;; *) data="$ROOT/$data" ;; esac
  mkdir -p "$data"
  log="$data/server.log"
  (cd "$ROOT" && nohup node server/index.js >>"$log" 2>&1 &)
  tries=0
  until agent_office_running; do
    tries=$((tries + 1))
    if [ "$tries" -gt 50 ]; then
      fail "The server did not start within 10 seconds. See $log"
      exit 1
    fi
    sleep 0.2
  done
  say "agent-office-3d started at $URL (log: $log)"
fi

if [ "$open_browser" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1
  else
    say "Open $URL in your browser."
  fi
fi
exit 0
