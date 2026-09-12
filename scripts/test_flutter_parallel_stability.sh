#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRESS_RUNS=5

cd "$ROOT"

if [[ -n "${SIT_FLUTTER_TEST_CONCURRENCY:-}" ]]; then
  echo "ERROR: The stability proof must use Flutter's standard parallelism." >&2
  exit 1
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "ERROR: flutter is not available in PATH." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: The stability proof requires a clean exact-commit worktree." >&2
  exit 1
fi

exact_commit="$(git rev-parse HEAD)"

for stress_run in $(seq 1 "$STRESS_RUNS"); do
  echo "Flutter standard-parallel stability run ${stress_run}/${STRESS_RUNS} at ${exact_commit}."
  flutter test --reporter expanded
done

printf '{"status":"passed","runs":%s,"parallelism":"flutter-default","commit":"%s"}\n' \
  "$STRESS_RUNS" "$exact_commit"
