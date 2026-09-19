#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_RUNS=5
POSTGRES_RUNS=2

cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not available in PATH." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm is not available in PATH." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: The reset-token boundary proof requires a clean exact-commit worktree." >&2
  exit 1
fi

exact_commit="$(git rev-parse HEAD)"

for unit_run in $(seq 1 "$UNIT_RUNS"); do
  echo "Reset-token single-clock unit run ${unit_run}/${UNIT_RUNS} at ${exact_commit}."
  node --test \
    --test-name-pattern "password-reset lifetime uses one deterministic issuance timestamp" \
    backend/test/account_security.test.js
done

for postgres_run in $(seq 1 "$POSTGRES_RUNS"); do
  echo "Reset-token PostgreSQL 16 boundary run ${postgres_run}/${POSTGRES_RUNS} at ${exact_commit}."
  pnpm --dir backend run test:postgres:local
done

printf '{"status":"passed","unitRuns":%s,"postgresRuns":%s,"clock":"single-issued-at","commit":"%s"}\n' \
  "$UNIT_RUNS" "$POSTGRES_RUNS" "$exact_commit"
