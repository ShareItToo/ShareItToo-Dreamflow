#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_web_root="$task_root/build/web"
task_port="${P0A_WEB_SMOKE_PORT:-0}"

[[ "$task_port" =~ ^[0-9]{1,5}$ ]] || {
  echo "ERROR: P0A_WEB_SMOKE_PORT must be a numeric loopback port from 0 to 65535." >&2
  exit 1
}

(( task_port <= 65535 )) || {
  echo "ERROR: P0A_WEB_SMOKE_PORT must be a numeric loopback port from 0 to 65535." >&2
  exit 1
}

exec python3 "$task_root/tool/run_p0a_web_smoke.py" \
  --web-root "$task_web_root" \
  --port "$task_port"
