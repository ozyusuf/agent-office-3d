#!/bin/sh
# agent-office-3d installer for Linux and macOS (the twin of install.ps1, D70).
#
#   sh install.sh
#
# 1. checks Node.js (20 or newer) and curl, runs npm install,
# 2. adds the hook to your Claude Code user settings (~/.claude/settings.json, or
#    $CLAUDE_CONFIG_DIR/settings.json): shows the exact change, asks first, saves a backup,
# 3. offers to start the server and open the monitor now.
# uninstall.sh undoes step 2. Safe to run again (it changes only what is missing).
#
# Scripted runs: --yes approves the settings change without asking; then the server starts only
# with --start-now. --settings <file> points at another settings file (tests use scratch files).
# Keep this file ASCII-only.
set -u
. "$(dirname -- "$0")/scripts/common.sh"

yes=0
start_now=0
settings=''
while [ $# -gt 0 ]; do
  case $1 in
    --yes | -y) yes=1 ;;
    --start-now) start_now=1 ;;
    --settings)
      shift
      settings=${1:-}
      [ -n "$settings" ] || { fail '--settings needs a file path'; exit 1; }
      ;;
    *) fail "unknown argument: $1"; exit 1 ;;
  esac
  shift
done

printf '\033[36m%s\033[0m\n' 'agent-office-3d installer'
say "Folder: $ROOT"

step '[1/3] Node.js and packages'
if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js was not found. Install Node.js 20 or newer (LTS), open a new terminal and run this again.'
  exit 1
fi
version=$(node --version)
major=$(printf '%s' "$version" | sed 's/^v//; s/\..*//')
if [ "$major" -lt 20 ] 2>/dev/null; then
  fail "Node.js $version is too old; version 20 or newer is needed."
  exit 1
fi
say "Node.js $version"
if ! command -v npm >/dev/null 2>&1; then
  fail 'npm was not found (it usually comes with Node.js). Install it and run this again.'
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  fail 'curl was not found. The hook uses it to send events; install curl and run this again.'
  exit 1
fi
if ! (cd "$ROOT" && npm install --no-audit --no-fund); then
  fail 'npm install failed (see above). Nothing else was changed.'
  exit 1
fi

step '[2/3] Claude Code hooks'
say 'The hook sends each Claude Code event to the local server (127.0.0.1 only). It runs in the'
say 'background, never blocks Claude and exits at once when the server is not running.'
say ''
set -- "$ROOT/scripts/setup.js" install
[ "$yes" = 1 ] && set -- "$@" --yes
[ -n "$settings" ] && set -- "$@" --settings "$settings"
node "$@"
code=$?
if [ "$code" -eq 2 ]; then
  say 'Without the hook the monitor gets no events. Run install.sh again whenever you like.'
  exit 2
fi
[ "$code" -eq 0 ] || exit 1

step '[3/3] Start'
if [ "$yes" = 1 ]; then
  [ "$start_now" = 1 ] && sh "$ROOT/scripts/start.sh"
elif ask 'Start the server and open the monitor now?' y; then
  sh "$ROOT/scripts/start.sh"
fi

say ''
say 'Done. Start the monitor any time with:  sh scripts/start.sh'
say 'Stop it with:                           sh scripts/stop.sh'
say 'Start on login: see "Linux and macOS" in README.md.'
exit 0
