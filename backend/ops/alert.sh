#!/usr/bin/env bash
set -euo pipefail

# Keep the public entrypoint stable; the stdlib helper owns the lock through SMTP.
task_ops_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec python3 -B "$task_ops_dir/alert_state.py" "$@"
