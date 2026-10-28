# Shared helpers for the Linux / macOS scripts (install.sh, uninstall.sh, scripts/start.sh,
# scripts/stop.sh). The POSIX twin of common.ps1. Source it; it sets ROOT and PORT.
# Keep this file ASCII-only.

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
[ -f "$ROOT/package.json" ] || ROOT=$(dirname -- "$ROOT")

# Port: env AGENT_OFFICE_PORT, else "port" in config.json, else 7847 (same order as the server).
agent_office_port() {
  if [ -n "$AGENT_OFFICE_PORT" ]; then
    printf '%s\n' "$AGENT_OFFICE_PORT"
    return
  fi
  config="${AGENT_OFFICE_CONFIG:-$ROOT/config.json}"
  found=''
  if [ -f "$config" ]; then
    found=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9][0-9][0-9][0-9]*\).*/\1/p' "$config" | head -n 1)
  fi
  printf '%s\n' "${found:-7847}"
}
PORT=$(agent_office_port)
URL="http://127.0.0.1:$PORT"

# True when an agent-office-3d server answers on PORT.
agent_office_running() {
  curl --silent --max-time 1 "$URL/health" 2>/dev/null | grep -q '"ok":true'
}

say() { printf '%s\n' "$*"; }
step() { printf '\n\033[36m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# ask "Question?" y|n  -> returns 0 for yes. The default is used for an empty answer.
ask() {
  hint='[y/N]'
  [ "$2" = y ] && hint='[Y/n]'
  printf '%s %s ' "$1" "$hint"
  read -r answer || answer=''
  [ -z "$answer" ] && answer=$2
  case $answer in
    y | Y | yes | YES | Yes) return 0 ;;
    *) return 1 ;;
  esac
}
