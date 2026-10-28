#!/bin/sh
# agent-office-3d uninstaller for Linux and macOS (the twin of uninstall.ps1, D70).
#
#   sh uninstall.sh [--yes] [--settings <file>]
#
# Takes the hook out of your Claude Code user settings (shows the change and asks first; puts back
# the exact pre-install copy when the file has not changed since) and offers to stop the server.
# Then you can delete the folder. Keep this file ASCII-only.
set -u
. "$(dirname -- "$0")/scripts/common.sh"

yes=0
settings=''
while [ $# -gt 0 ]; do
  case $1 in
    --yes | -y) yes=1 ;;
    --settings)
      shift
      settings=${1:-}
      [ -n "$settings" ] || { fail '--settings needs a file path'; exit 1; }
      ;;
    *) fail "unknown argument: $1"; exit 1 ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js was not found; it is needed to edit the settings file safely.'
  exit 1
fi

step 'Claude Code hooks'
set -- "$ROOT/scripts/setup.js" uninstall
[ "$yes" = 1 ] && set -- "$@" --yes
[ -n "$settings" ] && set -- "$@" --settings "$settings"
node "$@"
code=$?
[ "$code" -eq 2 ] && exit 2
[ "$code" -eq 0 ] || exit 1

if agent_office_running; then
  step 'Server'
  if [ "$yes" = 1 ] || ask "Stop the server on port $PORT now?" y; then
    sh "$ROOT/scripts/stop.sh"
  fi
fi
say ''
say 'agent-office-3d is uninstalled. You can delete this folder now.'
exit 0
